module.exports = {
  apps: [{
    name: "gaderia_mobile_admin_back",
    script: "./dist/main.js",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
}
