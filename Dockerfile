# Stage 1 — build + run tests
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Install system deps needed for some npm packages (optional but safe)
# Alpine often needs build-base and python for some native modules; Hardhat typically doesn't need heavy native build but keep these just in case.
RUN apk add --no-cache git python3 make g++ 

# Copy only package manifest first to leverage Docker cache
COPY package.json package-lock.json* ./

# Use CI install (reproducible when package-lock.json present)
RUN npm ci --no-audit --prefer-offline

# Copy the rest of the project
COPY . .

# Compile contracts (will download solc via Hardhat)
RUN npx hardhat compile

# Run tests (default behavior for this image)
CMD ["npx", "hardhat", "test", "--no-compile"]