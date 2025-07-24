# Mini Serverless Backend

This project is a serverless backend built with AWS CDK, Lambda, API Gateway, and DynamoDB using a single-table design. It manages employees, projects, and their assignments with full CRUD operations and efficient data modeling patterns.

## Tech Stack

- **AWS CDK (Cloud Development Kit)** - Infrastructure as Code using TypeScript to define AWS resources like DynamoDB tables, Lambda functions, and API Gateway routes
- **AWS Lambda** - Serverless compute service to handle business logic for employee, project, and assignment operations
- **AWS API Gateway** - Provides RESTful HTTP endpoints that trigger Lambda functions
- **AWS DynamoDB** - NoSQL database using a single-table design to effectively store employees, projects, assignments, in a scalable way

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

Install both root-level and `src` dependencies:

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

_For more information on how to configure your AWS CLI:_ https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html

4. Bootstrap CDK (only once per environment)

```
cdk bootstrap
```

5. Deploy the stack

```
npm run deploy
```

This will:

- Create the DynamoDB table
- Deploy Lambda functions
- Set up API Gateway routes
- Output the API endpoint URL (use this for API testing or store in frontend `.env`)

6. Destroy the stack

```
npx cdk destroy
```

## API Documentation

- You can import the [Postman collection](mini-serverless-backend-api.json)

## Development Notes

- The `cdk.json` file tells the CDK Toolkit how to execute your app.
- Utilize **AWS CloudWatch** for debugging

- Custom commands for this project:

  - `npm run synth` npm run build + npx cdk synth
  - `npm run deploy` npm run build + npx cdk deploy

- Useful commands:
  - `npm run build` compile typescript to js
  - `npm run watch` watch for changes and compile
  - `npm run test` perform the jest unit tests
  - `npx cdk deploy` deploy this stack to your default AWS account/region
  - `npx cdk diff` compare deployed stack with current state
  - `npx cdk synth` emits the synthesized CloudFormation template
