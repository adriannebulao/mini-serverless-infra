import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";

export class MiniReactFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontendBuildPath = process.env.FRONTEND_BUILD_PATH;
    if (!frontendBuildPath) {
      throw new Error(
        "FRONTEND_BUILD_PATH environment variable is not defined."
      );
    }

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new BucketDeployment(this, "FrontendDeployment", {
      sources: [Source.asset(frontendBuildPath)],
      destinationBucket: frontendBucket,
    });

    new cdk.CfnOutput(this, "FrontendURL", {
      value: frontendBucket.bucketWebsiteUrl,
    });
  }
}
