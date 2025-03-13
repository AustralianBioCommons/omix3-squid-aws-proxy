import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import { SquidAwsProxyStack, SquidAwsProxyProps } from '../lib/squid-aws-proxy-stack';


export class PipelineStage extends cdk.Stage {

    constructor(scope: Construct, id: string, props: cdk.StageProps, squidProps?: SquidAwsProxyProps) {
        super(scope, id, props);

        new SquidAwsProxyStack(this, `SquidAwsProxyStack-${squidProps?.envName}`, {
            env: squidProps?.env!,
            envName: squidProps?.envName!,
            vpcId: squidProps?.vpcId!,
            proxiedSubnets: squidProps?.proxiedSubnets!
          });


    }
}
