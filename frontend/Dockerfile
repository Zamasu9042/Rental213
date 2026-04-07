# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Expose Vite default port
EXPOSE 3000

# Run dev server bound to 0.0.0.0 so Docker can reach it
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
