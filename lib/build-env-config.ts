export const BuildEnv = {
    tools: {
        aws: {
            account: '000000000000',
            region: 'ap-southeast-2',
        },
        name: "tools",
        vpcId: "vpc-xxxxxxxx",
    },
    uat: {
        aws: {
            account: '111111111111',
            region: 'ap-southeast-2',
        },
        name: "uat",
        vpcId: "vpc-yyyyyyyy",
        proxiedSubnets: ["subnet-aaaa1111", "subnet-bbbb2222", "subnet-cccc3333"]
    },
    staging: {
        aws: {
            account: '222222222222',
            region: 'ap-southeast-2',
        },
        name: "staging",
        vpcId: "vpc-zzzzzzzz",
        proxiedSubnets: ["subnet-dddd4444", "subnet-eeee5555", "subnet-ffff6666"]
    },
    prod: {
        aws: {
            account: '333333333333',
            region: 'ap-southeast-2',
        },
        name: "prod",
        vpcId: "vpc-wwwwwwww",
        proxiedSubnets: ["subnet-gggg7777", "subnet-hhhh8888", "subnet-iiii9999"]
    },
};
