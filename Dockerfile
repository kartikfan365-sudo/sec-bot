# Use Node LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for typescript compilation)
RUN npm ci

# Copy source code and config files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Copy static assets to dist folder
RUN cp -r src/dashboard/public dist/dashboard/public


# Prune dev dependencies to keep image size small
RUN npm prune --production

# Expose Express Dashboard port
EXPOSE 5000

# Set production environment
ENV NODE_ENV=production

# Start command
CMD ["npm", "start"]
