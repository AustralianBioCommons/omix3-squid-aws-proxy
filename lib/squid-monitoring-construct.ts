import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { 
    aws_cloudwatch as cloudwatch,
    aws_autoscaling as autoscaling,
    aws_cloudwatch_actions as cloudwatch_actions,
    aws_sns as sns
 } from 'aws-cdk-lib';


 export class SquidMonitoringConstruct extends Construct {

    public squidAlarmTopic: sns.Topic
    constructor(scope: Construct, id: string, squidAsgs: autoscaling.AutoScalingGroup[]){
        super(scope, id);

        // SNS Topic for alarm
        this.squidAlarmTopic = new sns.Topic(scope, 'squid-asg-alarm-topic', {
            displayName: 'Squid ASG Alarm Topic'
        })

        // Create metric to use for triggering alarm when there is no CPU usage from the squid process

        squidAsgs.forEach((asg, index) => {
            const squidMetric = new cloudwatch.Metric({
                namespace: 'CWAgent',
                metricName: 'procstat_cpu_usage',
                //statistic: cloudwatch.Stats.AVERAGE,
                dimensionsMap: {
                    AutoScalingGroupName: asg.autoScalingGroupName as string,
                    pidfile: '/var/run/squid.pid',
                    process_name: 'squid'
                }
            });
            
            // CloudWatch alarms to alert on Squid ASG issue
            const squidAlarm = new cloudwatch.Alarm(scope, `squid-alarm-${index + 1}`,
                {
                    alarmDescription: `Heart beat for Squid instance ${index + 1}`,
                    alarmName: `squid-alarm_${asg.autoScalingGroupName as string}`,
                    comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
                    metric: squidMetric,
                    evaluationPeriods: 1,
                    threshold: 0,
                    treatMissingData: cloudwatch.TreatMissingData.BREACHING,
                
                }
            )

            squidAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.squidAlarmTopic))
            squidAlarm.addOkAction(new cloudwatch_actions.SnsAction(this.squidAlarmTopic))

  
        })
    }
 }