# Mini Serverless Infra

This project defines the serverless infrastructure using AWS CDK. It provisions AWS Lambda, API Gateway, DynamoDB (single-table), and S3 to support a full-stack employee-project management app.

## Architecture Overview

This project includes two deployable stacks:

- **Backend Stack** (`MiniServerlessBackendStack`)  
  Deploys Lambda functions, API Gateway routes, and a DynamoDB table

- **Frontend Stack** (`MiniReactFrontendStack`)  
  Deploys a static React frontend to an S3 bucket for website hosting

## Tech Stack

- **AWS CDK (Cloud Development Kit)** - Infrastructure as Code using TypeScript to define AWS resources like DynamoDB tables, Lambda functions, and API Gateway routes
- **AWS Lambda** - Serverless compute service to handle business logic for employee, project, and assignment operations
- **AWS API Gateway** - Provides RESTful HTTP endpoints that trigger Lambda functions
- **AWS DynamoDB** - NoSQL database using a single-table design to effectively store employees, projects, assignments in a scalable way

## Getting Started

### Requirements

- **Node.js** (v18 or higher recommended) - Needed for running TypeScript, esbuild, and CDK
- **npm** - For installing project dependencies
- **AWS CLI** - Used to configure your AWS credentials via `aws configure`
- **AWS CDK CLI** - Required to synthesize and deploy the infrastructure
- **AWS account** - To deploy infrastructure and run the services (Lambda, API Gateway, DynamoDB, etc.)
- **IAM credentials with necessary permissions** - Ensure your AWS credentials have permissions to create and manage:
  - Lambda functions
  - API Gateway
  - DynamoDB tables
  - IAM roles/policies

### Setup & Deployment

1. Clone the repository

```
git clone https://github.com/adriannebulao/mini-serverless-backend.git
cd mini-serverless-backend
```

2. Install dependencies

Install both root-level (`/`) and lambda-level (`/src`) dependencies:

```
npm install
cd src && npm install
```

3. Configure environment variables

Create a `.env` file:

```
# On Windows
xcopy .env.sample .env
```

```
# On UNIX
cp .env.sample .env
```

You can get your `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` values for `.env` from AWS CLI:

```
aws sts get-caller-identity --query "Account" --output text
aws configure get region
```

> _For more information on how to configure your AWS CLI:_ https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html

4. Bootstrap CDK (only once per environment)

```
cdk bootstrap
```

5. Deploy frontend to AWS S3

```
npm run deploy:frontend
```

Copy the frontend URL output from the CDK CLI and set it as the `FRONTEND_URL` value in your `.env` file

6. Deploy the backend stack

```
npm run deploy:backend
```

This will:

- Create the DynamoDB table
- Deploy Lambda functions
- Set up API Gateway routes
- Output the API endpoint URL (use this for API testing or store in frontend `.env`)

7. Destroy the stacks

```
npx cdk destroy --all
```

## API Documentation

- You can import the [Postman collection](mini-serverless-backend-api.json)

## Development & Deployment Notes

- The `cdk.json` file tells the CDK Toolkit how to execute your app.
- Utilize **AWS CloudWatch Logs Live Tail** for debugging

### Custom Project Commands

| Command                    | Description                            |
| -------------------------- | -------------------------------------- |
| `npm run deploy:frontend`  | Deploy React frontend to S3            |
| `npm run deploy:backend`   | Deploy backend stack (Lambda, API, DB) |
| `npm run deploy:all`       | Deploy both frontend and backend       |
| `npm run destroy`          | Destroy all deployed stacks            |
| `npm run destroy:frontend` | Destroy only the frontend stack        |
| `npm run destroy:backend`  | Destroy only the backend stack         |
| `npm run synth:backend`    | Synth backend stack to CloudFormation  |
| `npm run build`            | Compile TypeScript + bundle Lambdas    |
| `npm run watch`            | Recompile on file changes              |
| `npm run test`             | Run Jest tests                         |
