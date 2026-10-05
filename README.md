# Farm2Market
1. `npm install`
2. `mysql -u root -p < schema.sql`
3. `cp .env.example .env` and fill in DB + Razorpay TEST keys (dashboard.razorpay.com > Settings > API Keys) and a long random JWT_SECRET
4. `npm start` then open http://localhost:3000
Test payment: UPI `success@razorpay`, or card 4111 1111 1111 1111 (any future expiry/CVV).
Deploy: any Node host (Render, Railway, VPS + PM2 + Nginx), managed MySQL, set env vars there, NODE_ENV=production, serve over HTTPS, switch to Razorpay live keys.
