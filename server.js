require('dotenv').config();
const express=require('express'),mysql=require('mysql2/promise'),bcrypt=require('bcrypt'),jwt=require('jsonwebtoken'),
crypto=require('crypto'),multer=require('multer'),path=require('path'),helmet=require('helmet'),
cookieParser=require('cookie-parser'),rateLimit=require('express-rate-limit'),Razorpay=require('razorpay');
const app=express(),db=mysql.createPool({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,decimalNumbers:true});
const rzp=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'","https://checkout.razorpay.com"],frameSrc:["https://api.razorpay.com","https://checkout.razorpay.com"],imgSrc:["'self'","data:"],connectSrc:["'self'","https://lumberjack.razorpay.com"],styleSrc:["'self'","'unsafe-inline'"]}}}));
app.use(express.json({limit:'100kb'}));app.use(cookieParser());
app.use(express.static('public'));app.use('/uploads',express.static('uploads'));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,max:50}));
const upload=multer({storage:multer.diskStorage({destination:'uploads',filename:(r,f,cb)=>cb(null,Date.now()+path.extname(f.originalname).toLowerCase())}),
 limits:{fileSize:2e6},fileFilter:(r,f,cb)=>cb(null,/^image\/(jpeg|png|webp)$/.test(f.mimetype))});
const wrap=fn=>(q,s,n)=>fn(q,s,n).catch(e=>{console.error(e);s.status(500).json({error:'Server error'})});
const auth=role=>(q,s,n)=>{try{const u=jwt.verify(q.cookies.token,process.env.JWT_SECRET);if(role&&u.role!==role)return s.status(403).json({error:'Forbidden'});q.user=u;n()}catch{s.status(401).json({error:'Please log in'})}};
const bad=(s,m)=>s.status(400).json({error:m}),num=v=>Number(v),isEmail=e=>/^\S+@\S+\.\S+$/.test(e||'');
const setCookie=(s,u)=>s.cookie('token',jwt.sign({id:u.id,role:u.role,name:u.name},process.env.JWT_SECRET,{expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'});

// AUTH
app.post('/api/auth/register',wrap(async(q,s)=>{
 const{name,email,phone,password,role,farm_name,location,buyer_type}=q.body;
 if(!name||!isEmail(email)||!password||password.length<8)return bad(s,'Name, valid email and 8+ char password required');
 if(!['farmer','buyer'].includes(role))return bad(s,'Invalid role');
 if(phone&&!/^\d{10}$/.test(phone))return bad(s,'Phone must be 10 digits');
 const[ex]=await db.query('SELECT id FROM users WHERE email=?',[email]);if(ex.length)return bad(s,'Email already registered');
 const[r]=await db.query('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)',[name,email,phone||null,await bcrypt.hash(password,12),role]);
 if(role==='farmer')await db.query('INSERT INTO farmers(user_id,farm_name,location) VALUES(?,?,?)',[r.insertId,farm_name||null,location||null]);
 else await db.query('INSERT INTO buyers(user_id,buyer_type) VALUES(?,?)',[r.insertId,buyer_type||'household']);
 const u={id:r.insertId,role,name};setCookie(s,u);s.json(u)}));
app.post('/api/auth/login',wrap(async(q,s)=>{
 const{email,password,role}=q.body;const[[u]]=await db.query('SELECT * FROM users WHERE email=? AND role=?',[email,role]);
 if(!u||!await bcrypt.compare(password||'',u.password_hash))return s.status(401).json({error:'Invalid email or password'});
 setCookie(s,u);s.json({id:u.id,role:u.role,name:u.name})}));
app.post('/api/auth/logout',(q,s)=>{s.clearCookie('token');s.json({ok:true})});
app.get('/api/auth/me',auth(),(q,s)=>s.json(q.user));

// PRODUCTS
app.get('/api/categories',wrap(async(q,s)=>s.json((await db.query('SELECT * FROM categories'))[0])));
const PSEL=`SELECT p.*,c.name category,u.name farmer_name,f.farm_name,COALESCE(AVG(r.rating),0) rating,COUNT(r.id) reviews FROM products p JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=p.farmer_id JOIN farmers f ON f.user_id=p.farmer_id LEFT JOIN reviews r ON r.product_id=p.id`;
app.get('/api/products',wrap(async(q,s)=>{
 const w=['p.quantity>0'],a=[],{q:term,category,min,max,location,farmer}=q.query;
 if(term){w.push('p.name LIKE ?');a.push(`%${term}%`)}if(category){w.push('p.category_id=?');a.push(num(category))}
 if(min){w.push('p.price>=?');a.push(num(min))}if(max){w.push('p.price<=?');a.push(num(max))}
 if(location){w.push('p.location LIKE ?');a.push(`%${location}%`)}if(farmer){w.push('p.farmer_id=?');a.push(num(farmer))}
 s.json((await db.query(`${PSEL} WHERE ${w.join(' AND ')} GROUP BY p.id ORDER BY p.created_at DESC`,a))[0])}));
app.get('/api/products/mine',auth('farmer'),wrap(async(q,s)=>s.json((await db.query(`${PSEL} WHERE p.farmer_id=? GROUP BY p.id`,[q.user.id]))[0])));
app.get('/api/products/:id',wrap(async(q,s)=>{
 const[[p]]=await db.query(`${PSEL} WHERE p.id=? GROUP BY p.id`,[num(q.params.id)]);if(!p)return s.status(404).json({error:'Not found'});
 const[rv]=await db.query('SELECT r.rating,r.comment,u.name FROM reviews r JOIN users u ON u.id=r.buyer_id WHERE product_id=? ORDER BY r.id DESC',[p.id]);s.json({...p,reviewList:rv})}));
const pvalid=b=>b.name&&num(b.price)>0&&num(b.quantity)>=0&&num(b.category_id)>0;
app.post('/api/products',auth('farmer'),upload.single('image'),wrap(async(q,s)=>{
 const b=q.body;if(!pvalid(b))return bad(s,'Name, category, price and quantity are required');
 await db.query('INSERT INTO products(farmer_id,category_id,name,description,price,unit,quantity,image,location) VALUES(?,?,?,?,?,?,?,?,?)',
 [q.user.id,b.category_id,b.name,b.description||'',b.price,b.unit||'kg',b.quantity,q.file?'/uploads/'+q.file.filename:null,b.location||'']);s.json({ok:true})}));
app.put('/api/products/:id',auth('farmer'),upload.single('image'),wrap(async(q,s)=>{
 const b=q.body;if(!pvalid(b))return bad(s,'Invalid product data');
 const[r]=await db.query(`UPDATE products SET category_id=?,name=?,description=?,price=?,unit=?,quantity=?,location=?${q.file?',image=?':''} WHERE id=? AND farmer_id=?`,
 [b.category_id,b.name,b.description||'',b.price,b.unit||'kg',b.quantity,b.location||'',...(q.file?['/uploads/'+q.file.filename]:[]),num(q.params.id),q.user.id]);
 r.affectedRows?s.json({ok:true}):s.status(404).json({error:'Not found'})}));
app.delete('/api/products/:id',auth('farmer'),wrap(async(q,s)=>{await db.query('DELETE FROM products WHERE id=? AND farmer_id=?',[num(q.params.id),q.user.id]);s.json({ok:true})}));

// CART
app.get('/api/cart',auth('buyer'),wrap(async(q,s)=>s.json(await cartOf(q.user.id))));
async function cartOf(id){const[items]=await db.query('SELECT c.id,c.quantity,p.id product_id,p.name,p.price,p.unit,p.quantity stock,p.image,u.name farmer_name FROM cart c JOIN products p ON p.id=c.product_id JOIN users u ON u.id=p.farmer_id WHERE c.buyer_id=?',[id]);
 const subtotal=items.reduce((t,i)=>t+i.price*i.quantity,0),delivery=!items.length||subtotal>=500?0:40;return{items,subtotal,delivery,total:subtotal+delivery}}
app.post('/api/cart',auth('buyer'),wrap(async(q,s)=>{const qty=num(q.body.quantity)||1;if(qty<=0)return bad(s,'Invalid quantity');
 await db.query('INSERT INTO cart(buyer_id,product_id,quantity) VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[q.user.id,num(q.body.product_id),qty]);s.json({ok:true})}));
app.put('/api/cart/:id',auth('buyer'),wrap(async(q,s)=>{const qty=num(q.body.quantity);if(!(qty>0))return bad(s,'Invalid quantity');
 await db.query('UPDATE cart SET quantity=? WHERE id=? AND buyer_id=?',[qty,num(q.params.id),q.user.id]);s.json({ok:true})}));
app.delete('/api/cart/:id',auth('buyer'),wrap(async(q,s)=>{await db.query('DELETE FROM cart WHERE id=? AND buyer_id=?',[num(q.params.id),q.user.id]);s.json({ok:true})}));

// PAYMENTS (Razorpay) - amounts always computed on the server from DB prices
app.post('/api/payments/create-order',auth('buyer'),wrap(async(q,s)=>{
 const a=q.body;if(!a.full_name||!/^\d{10}$/.test(a.phone||'')||!isEmail(a.email)||!a.address||!a.city||!a.state||!/^\d{6}$/.test(a.pincode||''))return bad(s,'Please complete all delivery fields correctly');
 const cart=await cartOf(q.user.id);if(!cart.items.length)return bad(s,'Cart is empty');
 if(cart.items.some(i=>i.quantity>i.stock))return bad(s,'Some items exceed available stock');
 const conn=await db.getConnection();let orderId;
 try{await conn.beginTransaction();
  const[ad]=await conn.query('INSERT INTO addresses(buyer_id,full_name,phone,email,address,city,state,pincode) VALUES(?,?,?,?,?,?,?,?)',[q.user.id,a.full_name,a.phone,a.email,a.address,a.city,a.state,a.pincode]);
  const[o]=await conn.query('INSERT INTO orders(buyer_id,address_id,subtotal,delivery_charge,total) VALUES(?,?,?,?,?)',[q.user.id,ad.insertId,cart.subtotal,cart.delivery,cart.total]);orderId=o.insertId;
  for(const i of cart.items){const[f]=await conn.query('SELECT farmer_id FROM products WHERE id=?',[i.product_id]);
   await conn.query('INSERT INTO order_items(order_id,product_id,farmer_id,quantity,price) VALUES(?,?,?,?,?)',[orderId,i.product_id,f[0].farmer_id,i.quantity,i.price])}
  const ro=await rzp.orders.create({amount:Math.round(cart.total*100),currency:'INR',receipt:'order_'+orderId});
  await conn.query('INSERT INTO payments(order_id,razorpay_order_id,amount) VALUES(?,?,?)',[orderId,ro.id,cart.total]);
  await conn.commit();s.json({orderId,razorpayOrderId:ro.id,amount:ro.amount,keyId:process.env.RAZORPAY_KEY_ID})}
 catch(e){await conn.rollback();throw e}finally{conn.release()}}));
app.post('/api/payments/verify',auth('buyer'),wrap(async(q,s)=>{
 const{razorpay_order_id:oid,razorpay_payment_id:pid,razorpay_signature:sig}=q.body;if(!oid||!pid||!sig)return bad(s,'Missing payment data');
 const exp=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(oid+'|'+pid).digest('hex');
 const ok=exp.length===sig.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(sig));
 const[[p]]=await db.query('SELECT p.order_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.razorpay_order_id=? AND o.buyer_id=?',[oid,q.user.id]);if(!p)return s.status(404).json({error:'Order not found'});
 if(!ok){await db.query("UPDATE payments SET status='failed',razorpay_payment_id=?,razorpay_signature=? WHERE razorpay_order_id=?",[pid,sig,oid]);await db.query("UPDATE orders SET payment_status='Failed' WHERE id=?",[p.order_id]);return bad(s,'Payment verification failed')}
 await db.query("UPDATE payments SET status='success',razorpay_payment_id=?,razorpay_signature=? WHERE razorpay_order_id=?",[pid,sig,oid]);
 await db.query("UPDATE orders SET payment_status='Paid' WHERE id=?",[p.order_id]);
 await db.query('UPDATE products p JOIN order_items i ON i.product_id=p.id SET p.quantity=GREATEST(p.quantity-i.quantity,0) WHERE i.order_id=?',[p.order_id]);
 await db.query('DELETE FROM cart WHERE buyer_id=?',[q.user.id]);s.json({ok:true,orderId:p.order_id})}));
app.post('/api/payments/failed',auth('buyer'),wrap(async(q,s)=>{const st=q.body.cancelled?'cancelled':'failed';
 await db.query('UPDATE payments p JOIN orders o ON o.id=p.order_id SET p.status=?,o.payment_status=? WHERE p.razorpay_order_id=? AND o.buyer_id=? AND p.status="created"',[st,st==='cancelled'?'Cancelled':'Failed',q.body.razorpay_order_id,q.user.id]);s.json({ok:true})}));

// ORDERS / REVIEWS
const OSEL=`SELECT i.id item_id,i.order_id,i.quantity,i.price,i.status,p.name,o.payment_status,o.total,o.created_at`;
app.get('/api/orders',auth('buyer'),wrap(async(q,s)=>s.json((await db.query(`${OSEL},p.id product_id FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id WHERE o.buyer_id=? AND o.payment_status<>'Pending' ORDER BY o.id DESC`,[q.user.id]))[0])));
app.get('/api/farmer/orders',auth('farmer'),wrap(async(q,s)=>s.json((await db.query(`${OSEL},a.full_name,a.address,a.city,a.phone FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id JOIN addresses a ON a.id=o.address_id WHERE i.farmer_id=? AND o.payment_status='Paid' ORDER BY o.id DESC`,[q.user.id]))[0])));
app.patch('/api/farmer/orders/:id',auth('farmer'),wrap(async(q,s)=>{if(!['Confirmed','Packed','Shipped','Delivered'].includes(q.body.status))return bad(s,'Invalid status');
 await db.query('UPDATE order_items SET status=? WHERE id=? AND farmer_id=?',[q.body.status,num(q.params.id),q.user.id]);s.json({ok:true})}));
app.get('/api/farmer/stats',auth('farmer'),wrap(async(q,s)=>{const[[r]]=await db.query("SELECT COALESCE(SUM(i.quantity*i.price),0) earnings,COUNT(DISTINCT i.order_id) orders FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.farmer_id=? AND o.payment_status='Paid'",[q.user.id]);s.json(r)}));
app.post('/api/reviews',auth('buyer'),wrap(async(q,s)=>{const r=num(q.body.rating);if(!(r>=1&&r<=5))return bad(s,'Rating 1-5');
 const[[ok]]=await db.query("SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.buyer_id=? AND i.product_id=? AND o.payment_status='Paid' LIMIT 1",[q.user.id,num(q.body.product_id)]);
 if(!ok)return bad(s,'Only buyers of this product can review it');
 await db.query('INSERT INTO reviews(product_id,buyer_id,rating,comment) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE rating=VALUES(rating),comment=VALUES(comment)',[num(q.body.product_id),q.user.id,r,(q.body.comment||'').slice(0,500)]);s.json({ok:true})}));
app.get('*',(q,s)=>s.sendFile(path.join(__dirname,'public/index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Farm2Market running'));
