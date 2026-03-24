module.exports = {
  apps: [{
    name: "nextjs-app-orders-front",
    script: "./dist/main.js",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
}
