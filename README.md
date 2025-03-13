Squid AWS Proxy CDK Deployment
==============================

This repository contains the AWS CDK setup for deploying the Squid AWS Proxy infrastructure. You can deploy using an AWS CodePipeline or manually without the pipeline.

Prerequisites
-------------

1.  **Install AWS CDK** (if not already installed):

    ```
    npm install -g aws-cdk
    ```

2.  **Ensure AWS credentials are configured**:

    -   Use IAM roles or `aws configure` if necessary.

3.  **Install dependencies**:

    ```
    npm install
    ```

4.  **Ensure** `**build-env-config.ts**` **exists** in `lib/` directory with the following format:

    ```
    export const BuildEnv = {
        uat: {
            aws: { account: '123456789013', region: 'ap-southeast-2' },
            name: "uat",
            vpcId: "vpc-xxxxxxxx",
            proxiedSubnets: ["subnet-cccc3333", "subnet-dddd4444"]
        },
        staging: {
            aws: { account: '123456789014', region: 'ap-southeast-2' },
            name: "staging",
            vpcId: "vpc-yyyyyyyy",
            proxiedSubnets: ["subnet-eeee5555", "subnet-ffff6666"]
        },
        prod: {
            aws: { account: '123456789015', region: 'ap-southeast-2' },
            name: "prod",
            vpcId: "vpc-zzzzzzzz",
            proxiedSubnets: ["subnet-gggg7777", "subnet-hhhh8888"]
        },
    };

    ```

Squid Configuration Files
-------------------------

The actual Squid configuration files are located in the `assets/config_files` directory. These files define Squid proxy settings, access controls, and whitelist rules. Ensure they are properly configured before deploying.

Auto-Healing and Recovery
-------------------------

The Squid proxy deployment includes auto-healing mechanisms using AWS Lambda and Auto Scaling Groups:

-   If an instance fails, Auto Scaling will replace it automatically.

-   A Lambda function monitors instance health and can trigger recovery actions if needed.

-   The Lambda function references the instance ID in its event processing logic:

    ```
    lambda: 'InstanceId': instance_id
    ```

This ensures high availability and reliability of the Squid proxy service.

Route Table Updates
-------------------

The deployment includes automatic updates to the route tables to ensure correct network routing for Squid proxy instances:

-   Route table entries are modified to direct traffic through the Squid proxy.

-   If a new instance is deployed, the routing is adjusted accordingly.

-   This ensures seamless traffic flow and high availability.

Deployment Options
------------------

### 1. Deploying **With a Pipeline** (Recommended)

**Configuration in SSM Parameter store**

Github AWS Connecting ARN Parameter name: /gen3/github-connection-arn
Config Parameter name: /gen3/squid-environments

```
              {   "tools": {
                      "aws": { "account": "12345678901234", "region": "ap-southeast-2" },
                      "name": "tools",
                      "vpcId": "vpc-xxxxxxxx",
                  }, 
                  "uat": {
                      "aws": { "account": "12345678901234", "region": "ap-southeast-2" },
                      "name": "uat",
                      "vpcId": "vpc-xxxxxxxx",
                    "proxiedSubnets": ["subnet-cccc3333", "subnet-dddd4444"]
                  }
              }
```
```
cdk deploy --require-approval never
```

This will:

-   Create an AWS CodePipeline

-   Deploy the infrastructure through the pipeline

### 2. Deploying **Without a Pipeline** (Direct Stack Deployment)

Use this method for quick testing or if you don't want to use a pipeline.

```
cdk deploy --context deployWithoutPipeline=true --context targetEnv=staging --require-approval never
```

This will:

-   Deploy **only** the Squid AWS Proxy stack for the specified environment (`uat`, `staging`, or `prod`).

Troubleshooting
---------------

### "build-env-config.ts not found"

-   Ensure `build-env-config.ts` exists in the `lib/` directory.

-   Verify that it follows the required format (see above).

### "connectionArn is required"

-   If using a pipeline, ensure the arn is stored in ssm. (/gen3/github-connection-arn)`

### "Invalid environment 'xyz'"

-   Ensure you are using a valid environment: `uat`, `staging`, or `prod`.