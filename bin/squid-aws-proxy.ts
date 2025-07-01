#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { PipelineStage } from '../lib/pipeline-stage';
import { SquidAwsProxyStack } from '../lib/squid-aws-proxy-stack';
import { pipelines } from "aws-cdk-lib";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm"; // ✅ Import AWS SSM Client

const app = new cdk.App();

// Check if deploying without pipeline
const deployWithoutPipeline = app.node.tryGetContext("deployWithoutPipeline") === "true";

// Explicit AWS environment configuration
const awsEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT || "891377157203",
    region: process.env.CDK_DEFAULT_REGION || "ap-southeast-2"
};

if (!awsEnv.account || !awsEnv.region) {
    throw new Error("❌ ERROR: AWS Account or Region is missing! Ensure AWS credentials are configured.");
}

console.log(`Using AWS Account: ${awsEnv.account}, Region: ${awsEnv.region}`);

// Function to retrieve an SSM parameter at runtime
async function fetchSSMParameter(paramName: string): Promise<string> {
    console.log(`Fetching '${paramName}' from AWS SSM Parameter Store...`);

    const ssmClient = new SSMClient({ region: awsEnv.region });
    const command = new GetParameterCommand({ Name: paramName });

    try {
        const response = await ssmClient.send(command);
        if (!response.Parameter || !response.Parameter.Value) {
            throw new Error(`❌ ERROR: Parameter '${paramName}' not found or has no value!`);
        }

        console.log(`✅ Successfully retrieved '${paramName}'.`);
        return response.Parameter.Value;
    } catch (error) {
        console.error(`❌ ERROR: Failed to fetch '${paramName}' from SSM!`, error);
        process.exit(1);
    }
}

// Main function to initialize CDK app
(async () => {
    let BuildEnv: any;
    let connectionArn: string | undefined;

    if (!deployWithoutPipeline) {
        // Fetch BuildEnv from SSM
        const buildEnvParam = await fetchSSMParameter("/gen3/squid-environments");
        BuildEnv = JSON.parse(buildEnvParam);

        // Fetch connectionArn from SSM
        connectionArn = await fetchSSMParameter("/gen3/github-connection-arn");
    } else {
        console.log(" Running in local mode. Using local build-env-config.ts");
        try {
            ({ BuildEnv } = require('../lib/build-env-config'));
        } catch (error) {
            console.error("❌ ERROR: build-env-config.ts not found!");
            process.exit(1);
        }
    }

    // Set the target environment
    const targetEnv = app.node.tryGetContext("targetEnv") || "test"; 
    const envConfig = BuildEnv[targetEnv];

    if (!envConfig) {
        throw new Error(`❌ ERROR: Invalid environment '${targetEnv}'. Must be one of: ${Object.keys(BuildEnv).join(", ")}`);
    }

    if (deployWithoutPipeline) {
        console.log(`Deploying SquidAwsProxyStack for ${targetEnv} without a pipeline...`);
        new SquidAwsProxyStack(app, `SquidAwsProxyStack-${targetEnv}`, {
            env: envConfig.aws,
            envName: targetEnv,
            vpcId: envConfig.vpcId,
            proxiedSubnets: envConfig.proxiedSubnets,
        });
    } else {
        if (!connectionArn) {
            throw new Error("❌ ERROR: connectionArn is required but was not found in SSM! Ensure it is stored in '/gen3/github-connection-arn'.");
        }

        // Deploy the pipeline, update this with your own fork
        const squidProxy = new PipelineStack(app, 'squid-pipeline-stack', {
            env: awsEnv, // ✅ Explicitly set environment
            repoString: `AustralianBioCommons/omix3-squid-aws-proxy`,
            branch: "main",
            pipelineName: 'gen3-squid-pipeline',
            connectionArn,
        });

        // Get all environment names dynamically, excluding 'tools'
        const environmentNames = Object.keys(BuildEnv).filter(env => env !== "tools");

        // Add stages dynamically based on the filtered environment names
        for (const envName of environmentNames) {
            const config = BuildEnv[envName];

            if (!config.proxiedSubnets || !Array.isArray(config.proxiedSubnets) || config.proxiedSubnets.length === 0) {
                throw new Error(`❌ ERROR: Missing or invalid proxiedSubnets for '${envName}' in BuildEnv.`);
            }

            const stage = squidProxy.pipeline.addStage(new PipelineStage(
                app,
                `${envName}Stage`,
                { stageName: `${envName}Stage` },
                {
                    vpcId: config.vpcId,
                    envName: envName,
                    env: config.aws,
                    proxiedSubnets: config.proxiedSubnets,
                },
            ));

            // Add a manual approval step for Staging and Prod
            if (envName === 'staging' || envName === 'prod') {
                stage.addPre(new pipelines.ManualApprovalStep(`Promote to ${envName}`));
            }
        }
    }
})();
