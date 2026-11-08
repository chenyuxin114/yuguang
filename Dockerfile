FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10000

COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public

RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 10000

CMD ["node", "server.js"]
