#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MiniServerlessBackendStack } from "../lib/mini-serverless-backend-stack";
import { config } from "dotenv";
config();

const app = new cdk.App();
new MiniServerlessBackendStack(app, "MiniServerlessBackendStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
