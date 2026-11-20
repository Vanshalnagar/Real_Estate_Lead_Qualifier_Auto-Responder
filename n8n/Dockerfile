FROM n8nio/n8n:2.41.3
USER root
COPY --chown=node:node n8n/workflows /opt/nestr/workflows
COPY --chown=node:node n8n/credentials.manifest.json /opt/nestr/manifest.json
COPY --chown=node:node n8n/production-import.mjs n8n/start-production.mjs /opt/nestr/
USER node
ENTRYPOINT ["tini", "--", "node", "/opt/nestr/start-production.mjs"]
