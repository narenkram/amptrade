module.exports = {
  apps: [
    {
      name: "amptrade-api",
      script: "dist/server.js",
      env: {
        NODE_NO_WARNINGS: "1",
        NODE_ENV: "production",
      },
    },
  ],
};
