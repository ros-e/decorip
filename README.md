# decorip

## Getting Started
Clone the repository:
```bash
git clone https://github.com/ros-e/decorip.git
cd decorip
```

## Setup
Create a `.env` file
```bash
cp .env.example .env
```

Then configure your environment variables:
```
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
AWS_REGION=auto
#S3_UPLOAD_PREFIX=example/
S3_UPLOAD_PREFIX=
```

Start the script
```bash
bun run index.ts
```