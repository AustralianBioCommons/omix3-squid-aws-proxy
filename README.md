# 🦑 Squid AWS Proxy – CDK Deployment

This AWS CDK application deploys a **Squid proxy layer** on EC2 with Auto Scaling, route table automation via Lambda, CloudWatch monitoring, and optional GitHub-based CI/CD using CodePipeline.

---

## 📁 Project Structure

```
.
├── bin/
│   └── deploy.ts                  # CDK entrypoint
├── lib/
│   ├── build-env-config.ts        # Local env config
│   ├── pipeline-stack.ts          # CodePipeline definition
│   ├── pipeline-stage.ts          # Deployable CDK stage
│   ├── squid-aws-proxy-stack.ts   # Squid infrastructure stack
│   ├── squid-asg-construct.ts     # ASG + S3 config + user data
│   ├── squid-lambda-construct.ts  # Lambda for route updates
│   ├── squid-monitoring-construct.ts # CW metrics/alarms/SNS
│   └── iam.ts                     # IAM policies helper
├── assets/
│   ├── config_files/              # squid.conf, whitelist, etc.
│   ├── user_data/                 # EC2 bootstrap script
│   └── lambda/                    # Python Lambda code
└── cdk.json
```

---

## Deployment

### Prerequisites

- AWS CDK v2
- AWS CLI configured
- IAM credentials with access to EC2, S3, Lambda, SNS, SSM, CloudWatch, CodePipeline

---

### Option 1: Deploy With CodePipeline

```bash
cdk deploy   --context targetEnv=uat   --context deployWithoutPipeline=false
```

Required SSM Parameters:

- `/gen3/squid-environments` – JSON string with env configs
- `/gen3/github-connection-arn` – GitHub CodePipeline connection ARN

---

### Option 2: Direct Deployment (No Pipeline)

```bash
cdk deploy   --context targetEnv=uat   --context deployWithoutPipeline=true
```

Uses `lib/build-env-config.ts` instead of SSM.

---

## Deployed Resources

### 🟢 Squid EC2 Auto Scaling Groups

- One Squid instance per AZ in **public subnets**
- IAM role for CloudWatch, SSM, EC2 control
- User data installs and configures Squid
- Config pulled from S3 bucket
- Subnet route table IDs tagged onto each ASG

---

### 📊 CloudWatch Monitoring

- Metric: `procstat_cpu_usage` from Squid process
- One alarm per ASG instance
- Alarms trigger on **0% CPU** (missing heartbeat)
- Sends `ALARM` and `OK` to `squid-asg-alarm-topic` (SNS)

---

### 🛠 Lambda Function

- Subscribed to SNS alarm topic
- When an instance becomes healthy:
  - Updates route table in target subnets
  - Ensures traffic uses healthy Squid proxy

---

### 🔁 CodePipeline (Optional)

- Synth, build, and deploy stages per environment
- Manual approvals for `staging` and `prod`
- GitHub integrated via AWS CodeStar connection

---

## 🧰 Example `build-env-config.ts`

```ts
export const BuildEnv = {
  dev: {
    aws: {
      account: "123456789012",
      region: "ap-southeast-2"
    },
    vpcId: "vpc-abc12345",
    proxiedSubnets: [
      "subnet-aaa11111",
      "subnet-bbb22222"
    ]
  },
  uat: {
    aws: {
      account: "123456789012",
      region: "ap-southeast-2"
    },
    vpcId: "vpc-def67890",
    proxiedSubnets: [
      "subnet-ccc33333",
      "subnet-ddd44444"
    ]
  }
};
```

---

## 🔐 Example SSM Parameter (`/gen3/squid-environments`)

Set this as a **String** in AWS SSM Parameter Store:

```json
{
  "dev": {
    "aws": {
      "account": "123456789012",
      "region": "ap-southeast-2"
    },
    "vpcId": "vpc-abc12345",
    "proxiedSubnets": ["subnet-aaa11111", "subnet-bbb22222"]
  },
  "uat": {
    "aws": {
      "account": "123456789012",
      "region": "ap-southeast-2"
    },
    "vpcId": "vpc-def67890",
    "proxiedSubnets": ["subnet-ccc33333", "subnet-ddd44444"]
  }
}
```

---

## ✅ Commands Summary


### Direct deployment

```bash
cdk deploy --context targetEnv=dev --context deployWithoutPipeline=true
```

### Deploy via pipeline

```bash
cdk deploy --context targetEnv=dev --context deployWithoutPipeline=false
```

---

## 📄 License

MIT