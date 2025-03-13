import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { buildPolicyStatements } from './iam';


export interface PipelineProps extends cdk.StageProps {
  repoString: string;
  branch: string;
  pipelineName: string;
  env: cdk.Environment;
  connectionArn: string;  
}

export class PipelineStack extends cdk.Stack {
  public pipeline: CodePipeline;

  constructor(scope: Construct, id: string, props: PipelineProps) {
      super(scope, id, props);

      this.pipeline = new CodePipeline(this, "Pipeline", {
          pipelineName: props.pipelineName,
          crossAccountKeys: true,
          codeBuildDefaults: { rolePolicy: buildPolicyStatements },
          synth: new ShellStep("Synth", {
              input: CodePipelineSource.connection(
                  props.repoString,
                  props.branch,
                  {
                      connectionArn: props.connectionArn 
                  }
              ),
              commands: [
                  "npm ci && npm run build && npx cdk synth",
              ],
          }),
      });
  }
}
