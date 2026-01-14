-- Base extensions for UUIDs and hashing used by the API service
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Default schema for application tables
CREATE SCHEMA IF NOT EXISTS app;
