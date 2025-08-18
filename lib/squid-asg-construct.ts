import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
    aws_s3 as s3,
    aws_s3_deployment as s3Deployment,
    aws_ec2 as ec2,
    aws_iam as iam,
    aws_ssm as ssm,
    aws_lambda as lambda,
    aws_autoscaling as autoscaling,
    aws_autoscaling_hooktargets as hooktargets,
    aws_sns as sns
 } from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';
import {readFileSync} from 'fs';

 export class SquidAsgConstruct extends Construct {

    public squidAsgs: autoscaling.AutoScalingGroup[] = []

    constructor(scope: Construct, id: string, vpcId: string, region: string, envName: string, proxiedSubnets: string[]){
        super(scope, id);

        if (!proxiedSubnets || !Array.isArray(proxiedSubnets) || proxiedSubnets.length === 0) {
            throw new Error(`❌ ERROR: No valid proxied subnets provided for '${envName}'. 
            Ensure 'proxiedSubnets' is an array of subnet IDs in BuildEnv.`);
        }
    
        console.log(`🔍 Looking up proxied subnets for '${envName}':`, proxiedSubnets);

        const vpc = ec2.Vpc.fromLookup(this, 'vpc-lookup', {
            vpcId: vpcId
          })

        // Create an IAM role to attach to the squid instances
        const squidIamRole = new iam.Role(scope, 'squid-iam-role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2RoleforSSM')
            ]
        })

        // Add policy to allow EC2 update instance attributes
        squidIamRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ec2:ModifyInstanceAttribute'],
            resources: ['*']
        }))

        // Create bucket to hold Squid config and whitelist files
        const squidConfigBucket = new s3.Bucket(scope, 'squid-config', {
            encryption: s3.BucketEncryption.KMS_MANAGED
        })

        // Upload config and whiteliest files to S3 bucket
        new s3Deployment.BucketDeployment(scope, 'config', {
            destinationBucket: squidConfigBucket,
            sources: [s3Deployment.Source.asset('./assets/config_files')]
        })

        // Provide access to EC2 instance role to read and write to bucket
        squidConfigBucket.grantReadWrite(squidIamRole)

        // Set the AMI to the latest Amazon Linux 2
        const amazonLinuxAmi = ec2.MachineImage.latestAmazonLinux2({
            storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
            edition: ec2.AmazonLinuxEdition.STANDARD,
            virtualization: ec2.AmazonLinuxVirt.HVM
        })

        vpc.availabilityZones.forEach((zone, index) => {
            const asg = new autoscaling.AutoScalingGroup(scope, `asg-${index + 1}`, {
                vpc: vpc,
                instanceType: new ec2.InstanceType("t3.small"),
                desiredCapacity: 1,
                maxCapacity: 1,
                minCapacity: 1,
                machineImage: amazonLinuxAmi,
                role: squidIamRole,
                vpcSubnets: { 
                    subnetType: SubnetType.PUBLIC,
                    availabilityZones: [zone]
                 },
                healthChecks: autoscaling.HealthChecks.ec2({
                    gracePeriod: cdk.Duration.minutes(8)
                }),
                signals: autoscaling.Signals.waitForAll({
                    timeout: cdk.Duration.minutes(15)
                }),
                keyPair: undefined       
            });

            const cfnAsg = asg.node.defaultChild as autoscaling.CfnAutoScalingGroup;
            const asgLogicalId = cfnAsg.logicalId

            // User data: Required parameters in user data script
            const userDataMappings = {
                "__S3BUCKET__": squidConfigBucket.bucketName,
                "__ASG__": asgLogicalId,
                "__CW_ASG__": "${aws:AutoScalingGroupName}"
            }
        // Replace parameters with values in the user data
            const userDataPath = './assets/user_data/squid_user_data.sh';

            const userDataTemplate = readFileSync(userDataPath, {
                encoding: "utf-8"
            })
            
            const userData = cdk.Fn.sub(userDataTemplate, userDataMappings);

            asg.addUserData(userData)

            // Security group attached to the ASG Squid instances
            // Outbound: All allowed
            // Inboud: Allowed from VPC CIDR on ports 80, 443)

            asg.connections.allowFrom(
                ec2.Peer.ipv4(vpc.vpcCidrBlock),
                new ec2.Port(
                    {
                        protocol: ec2.Protocol.TCP,
                        fromPort: 80,
                        toPort: 80,
                        stringRepresentation: 'HTTP from VPC'
                    }
                )
            )

            asg.connections.allowFrom(
                ec2.Peer.ipv4(vpc.vpcCidrBlock),
                new ec2.Port(
                    {
                        protocol: ec2.Protocol.TCP,
                        fromPort: 443,
                        toPort: 443,
                        stringRepresentation: 'HTTPS from VPC'
                    }
                ) );

            asg.connections.allowFrom(
                ec2.Peer.ipv4(vpc.vpcCidrBlock),
                new ec2.Port(
                    {
                        protocol: ec2.Protocol.TCP,
                        fromPort: 22,
                        toPort: 22,
                        stringRepresentation: 'SSH from VPC'
                    }
                ) );
            // Create ASG Lifecycle hook to enable updating of route table using Lambda when instance launches and is marked Healthy
             new autoscaling.LifecycleHook(scope, `asg-hook-${index + 1}`, {
                autoScalingGroup: asg,
                lifecycleTransition: autoscaling.LifecycleTransition.INSTANCE_LAUNCHING,
                notificationTarget: new hooktargets.TopicHook(new sns.Topic(scope, `lifesycle-hook-topic-${index + 1}`,
                    {
                        displayName: `Squid ASG Lifecycle Hook topic ${index + 1}`
                    }
                )),
                defaultResult: autoscaling.DefaultResult.ABANDON,
                heartbeatTimeout: cdk.Duration.minutes(5)
             })

            // Select subnets based on `proxiedSubnets` from `BuildEnv`
            const selection: ec2.SubnetSelection = vpc.selectSubnets({
                subnetFilters: [ec2.SubnetFilter.byIds(proxiedSubnets)],
            });

             // Tag ASG with the route table IDs used by the isolated and/or private subnets in the availability zone
             // This tag will be used by the Squid Lambda function to identify route tables to update when alarm changes from ALARM to OK

             
             let routeTableIds = '';


            selection.subnets!.forEach((subnet) => {
                routeTableIds ? routeTableIds = `${routeTableIds},${subnet.routeTable.routeTableId}` 
                : routeTableIds = subnet.routeTable.routeTableId
             })

             cdk.Tags.of(asg).add(
                'RouteTableIds', routeTableIds,{
                    applyToLaunchedInstances: false
                }
             )

             this.squidAsgs.push(asg)

            })

    }
}