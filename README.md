# TaskFlow — Multi-Tier Cloud Application with CI/CD

> **Internship Demo Project** — 3-Tier Architecture (Frontend + Backend + Database) with automated CI/CD using GitHub Actions deployed to AWS Free Tier.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       USER BROWSER                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS CloudFront (CDN / HTTPS)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┴──────────────┐
         ▼                           ▼
┌─────────────────┐       ┌─────────────────────────────────┐
│   AWS S3 Bucket │       │      AWS EC2 t2.micro           │
│  (React Static) │       │  ┌──────────────────────────┐   │
│                 │       │  │  Nginx (port 80/443)      │   │
│  index.html     │       │  └────────────┬─────────────┘   │
│  assets/        │       │               │ proxy /api/*     │
│                 │       │  ┌────────────▼─────────────┐   │
└─────────────────┘       │  │ Docker: Node.js/Express   │   │
                          │  │ (port 3000)               │   │
                          │  └────────────┬─────────────┘   │
                          │               │                  │
                          │  ┌────────────▼─────────────┐   │
                          │  │ Docker: PostgreSQL 16     │   │
                          │  │ (port 5432, volume)       │   │
                          │  └──────────────────────────┘   │
                          └─────────────────────────────────┘
                                         ▲
                                         │ SSH Deploy
                          ┌──────────────┴──────────────────┐
                          │     GitHub Actions CI/CD         │
                          │  • frontend-deploy.yml → S3      │
                          │  • backend-deploy.yml  → EC2     │
                          └─────────────────────────────────┘
```

---

## 🚀 Quick Start — Run Locally (No AWS Needed)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js 20+](https://nodejs.org/) installed
- Git

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO/multi-tier-app
```

### 2. Start Backend + Database (Docker Compose)
```bash
cd infra
docker compose up --build -d
```
Wait ~20 seconds for PostgreSQL to initialize.

✅ Backend: http://localhost:3000/api/health  
✅ API: http://localhost:3000/api/tasks

### 3. Start Frontend (dev server)
```bash
cd ../frontend
npm install
npm run dev
```

✅ Frontend: http://localhost:5173

> The Vite dev server automatically proxies `/api/*` → `localhost:3000`

### 4. Stop everything
```bash
cd infra
docker compose down          # stop containers (keep DB data)
docker compose down -v       # stop and delete all data
```

---

## ☁️ AWS Deployment Guide

### Step 1 — Create S3 Bucket (Frontend)

```bash
# Create bucket
aws s3 mb s3://taskflow-frontend-YOUR_UNIQUE_ID --region us-east-1

# Enable static website hosting
aws s3 website s3://taskflow-frontend-YOUR_UNIQUE_ID \
  --index-document index.html \
  --error-document index.html

# Apply public read bucket policy
aws s3api put-bucket-policy \
  --bucket taskflow-frontend-YOUR_UNIQUE_ID \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::taskflow-frontend-YOUR_UNIQUE_ID/*"
    }]
  }'
```

### Step 2 — Create CloudFront Distribution

1. Go to **AWS Console → CloudFront → Create Distribution**
2. Origin: `taskflow-frontend-YOUR_UNIQUE_ID.s3-website-us-east-1.amazonaws.com`
3. Default Root Object: `index.html`
4. Error Pages: Set 404 → `index.html` (status 200) for React Router support
5. Note the **Distribution ID** and **Domain Name** (e.g. `d1234.cloudfront.net`)

### Step 3 — Launch EC2 Instance

1. **AWS Console → EC2 → Launch Instance**
   - AMI: **Amazon Linux 2023** (free tier eligible)
   - Type: **t2.micro** ✅ Free Tier
   - Key pair: Create new, download `.pem` file
   - Security Group Inbound rules:
     - Port 22 (SSH) — your IP only
     - Port 80 (HTTP) — 0.0.0.0/0
     - Port 443 (HTTPS) — 0.0.0.0/0

2. **User Data** (paste the entire `infra/ec2-setup.sh` content)

### Step 4 — Configure GitHub Secrets

Go to your GitHub repo → **Settings → Secrets → Actions → New Repository Secret**

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | `AKIA...` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | `secret...` | IAM user secret key |
| `AWS_REGION` | `us-east-1` | Your AWS region |
| `S3_BUCKET_NAME` | `taskflow-frontend-xxx` | Your S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1234...` | CloudFront distribution ID |
| `VITE_API_URL` | `http://EC2-IP/api` | EC2 public IP/domain |
| `EC2_HOST` | `54.123.456.789` | EC2 public IP |
| `EC2_USER` | `ec2-user` | EC2 username (or `ubuntu`) |
| `EC2_SSH_KEY` | `-----BEGIN RSA...` | Contents of your `.pem` file |

### Step 5 — IAM Policy for GitHub Actions

Attach this minimal policy to the IAM user:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketWebsite"],
      "Resource": [
        "arn:aws:s3:::taskflow-frontend-YOUR_UNIQUE_ID",
        "arn:aws:s3:::taskflow-frontend-YOUR_UNIQUE_ID/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution"],
      "Resource": "*"
    }
  ]
}
```

### Step 6 — Deploy!

```bash
git add .
git commit -m "feat: initial deployment"
git push origin main
```

Watch GitHub Actions run at: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`

---

## 🔌 API Reference

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Health check + DB status |
| GET | `/api/tasks` | — | List all tasks |
| POST | `/api/tasks` | `{ title, priority }` | Create a task |
| PATCH | `/api/tasks/:id` | `{ completed?, title?, priority? }` | Update task |
| DELETE | `/api/tasks/:id` | — | Delete task |

### Example requests
```bash
# Health check
curl http://localhost:3000/api/health

# List tasks
curl http://localhost:3000/api/tasks

# Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy to production", "priority": "high"}'

# Mark complete
curl -X PATCH http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Delete
curl -X DELETE http://localhost:3000/api/tasks/1
```

---

## 📁 Project Structure

```
multi-tier-app/
├── frontend/                 ← React + Vite (Tier 1)
│   ├── src/
│   │   ├── App.jsx           ← Main app with CRUD + status indicators
│   │   ├── main.jsx          ← React entry point
│   │   └── index.css         ← Dark glassmorphism design system
│   ├── index.html
│   ├── vite.config.js        ← Dev proxy: /api → localhost:3000
│   └── package.json
│
├── backend/                  ← Node.js + Express (Tier 2)
│   ├── src/
│   │   ├── index.js          ← Express server + all API routes
│   │   └── db.js             ← PostgreSQL pool + schema init + seeding
│   ├── Dockerfile            ← Multi-stage production build
│   ├── .env.example          ← Environment variables template
│   └── package.json
│
├── infra/                    ← Infrastructure
│   ├── docker-compose.yml    ← Backend + PostgreSQL containers
│   ├── nginx.conf            ← Nginx reverse proxy (EC2)
│   └── ec2-setup.sh          ← One-time EC2 bootstrap script
│
└── .github/
    └── workflows/
        ├── frontend-deploy.yml  ← CI/CD: S3 + CloudFront
        └── backend-deploy.yml   ← CI/CD: EC2 SSH deploy
```

---

## 💰 AWS Cost Estimate (Free Tier)

| Service | Free Tier | Est. Monthly Cost |
|---------|-----------|-------------------|
| S3 | 5 GB + 20K requests | **$0** |
| CloudFront | 1 TB transfer + 10M requests | **$0** |
| EC2 t2.micro | 750 hours/month | **$0** |
| Data Transfer | 15 GB/month | **$0** |
| **Total** | | **$0/month** ✅ |

> Free Tier is valid for 12 months from account creation.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, Axios |
| Backend | Node.js 20, Express 4, Helmet, Morgan |
| Database | PostgreSQL 16 |
| Containerization | Docker, Docker Compose v2 |
| Web Server | Nginx |
| CI/CD | GitHub Actions |
| Cloud | AWS S3, CloudFront, EC2 |
| Font | Inter (Google Fonts) |

---

## 👨‍💻 Author

Built as an internship demonstration project showcasing 3-tier cloud architecture with automated CI/CD pipelines.
