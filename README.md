# Pharmalyx Platform API (Pharmalyx-platform-admin-config)

### V 1.0.0

- updated one to many organisations


### V 1.0.1

- Ready for Render + Azure SQL: `DB_ENCRYPT=true` for Azure, `CORS_ORIGINS` to allow only the hosted platform admin page


### V 1.0.2

- Security headers with helmet and trust proxy
- CORS: when CORS_ORIGINS is not set on a hosted server, only the platform admin web app may call the API; local machines allow any origin
