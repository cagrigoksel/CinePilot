FROM node:20-slim

# Install Python & scraping dependencies
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv curl && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --break-system-packages cloudscraper beautifulsoup4 requests

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 7050

ENV PORT=7050
CMD ["node", "server.js"]
