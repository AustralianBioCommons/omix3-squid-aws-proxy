import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SquidAsgConstruct } from './squid-asg-construct';
import { SquidLambdaConstruct } from './squid-lambda-construct';
import { SquidMonitoringConstruct } from './squid-monitoring-construct';


export interface SquidAwsProxyProps extends cdk.StackProps {
  envName: string;
  vpcId: string;
  env: cdk.Environment;
  proxiedSubnets: string[];
}

export class SquidAwsProxyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: SquidAwsProxyProps) {
    super(scope, id, props);


    //  Create the core Squid components: 
    //  1. IAM instance profile to be used by the Squid instances
    //  2. S3 bucket to host Squid config and whitelist files
    //  3. Launch configuration with user data 
    //  4. Auto-Scaling Groups in each AZ with a Squid instance in the public subnet
    //  5. CloudWatch Log Groups to collect access and access logs from each instance in the ASGs

    const autoScalingGroups = new SquidAsgConstruct(this, 'squid-asgs', props?.vpcId!, this.region, props?.envName!, props?.proxiedSubnets!);

    // Create the Lambda components
    //  1. IAM role for Lambda to assume
    // 2. Lambda function that is triggered when the alarm state changes

    const lambdaFunction = new SquidLambdaConstruct(this, 'squid-lambda');

    // Create the mmonitoring components
    //  1. Metrics and alarms for each ASG
    // 2. SNS topic where change in alarm state is published
    
    const monitoring = new SquidMonitoringConstruct(this, 'squid-monitoring', autoScalingGroups.squidAsgs)

    monitoring.node.addDependency(lambdaFunction)

    // Add SNS subscription to tie the Lambda and CloudWatch alarm 

    lambdaFunction.addSnsSubscription(lambdaFunction.alarmFunction, monitoring.squidAlarmTopic)


  }
}