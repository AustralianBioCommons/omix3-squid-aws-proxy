import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
    aws_iam as iam,
    aws_lambda as lambda,
    aws_sns_subscriptions as snsSubscriptions,
    aws_sns as sns
 } from 'aws-cdk-lib';

export class SquidLambdaConstruct extends Construct {
    public alarmFunction: lambda.Function
    constructor(scope: Construct, id: string){
        super(scope, id);

        // Create IAM role for Lambda
        const lambdaIamRole = new iam.Role(scope, 'lambda-role', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')]
        });

        // Add policies to allow Lambda that allow it to update route tables of the VPC to point to a healthy Squid instance ENI
        const lambdaPermissions = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'autoscaling:Describe*',
                'autoscaling:CompleteLifecycleAction',
                'autoscaling:SetInstanceHealth',
                'autoscaling:DescribeAutoScalingGroups',
                'cloudwatch:Describe*',
                'ec2:CreateRoute',
                'ec2:CreateTags',
                'ec2:ReplaceRoute',
                'ec2:Describe*',
            ],
            resources: ['*']
        });




        // Create a Lambda function that is triggered when the Squid Alarm state changes
        this.alarmFunction = new lambda.Function(scope, 'alarm-function', {
            runtime: lambda.Runtime.PYTHON_3_10,
            handler: 'lambda-handler.handler',
            code: lambda.Code.fromAsset('./assets/lambda')
        })

        this.alarmFunction.addToRolePolicy(lambdaPermissions);
        
    }

    addSnsSubscription(lambdaFunction: lambda.Function, snsAlarmTopic: sns.Topic) {
        lambdaFunction.addEnvironment( 'TOPIC_ARN', snsAlarmTopic.topicArn )
        lambdaFunction.addPermission('squid-lambda-permissions', {
            principal: new iam.ServicePrincipal('sns.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceArn: snsAlarmTopic.topicArn
        })
        
        snsAlarmTopic.addSubscription(new snsSubscriptions.LambdaSubscription(lambdaFunction))
    }
    
}
