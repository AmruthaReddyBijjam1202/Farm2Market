const $=s=>document.querySelector(s),app=$('#app');let user=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Number(n).toFixed(2),img=p=>esc(p||'/images/logo.jpg');
const stars=r=>r?'★'.repeat(Math.round(r))+'☆'.repeat(5-Math.round(r)):'No ratings yet';
function toast(m,bad){const t=$('#toast');t.textContent=m;t.className='on'+(bad?' bad':'');setTimeout(()=>t.className='',2600)}
async function api(url,method='GET',body){const o={method,headers:{}};
 if(body instanceof FormData)o.body=body;else if(body){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body)}
 const r=await fetch('/api'+url,o),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
const form=f=>Object.fromEntries(new FormData(f));
function nav(){const l=$('#links');l.innerHTML=`<a href="#/market">Marketplace</a><a href="#/how">How it works</a>`+
 (!user?`<a href="#/login/buyer">Buyer login</a><a href="#/login/farmer">Farmer login</a><a class="btn sm" href="#/register/farmer">Join</a>`:
 user.role==='farmer'?`<a href="#/farmer">Dashboard</a><a href="#/add">Add product</a><a href="#" id="out">Logout</a>`:
 `<a href="#/cart">Cart</a><a href="#/orders">My orders</a><a href="#/buyer">Dashboard</a><a href="#" id="out">Logout</a>`);
 const o=$('#out');if(o)o.onclick=async e=>{e.preventDefault();await api('/auth/logout','POST');user=null;nav();location.hash='#/'}}
$('#menu').onclick=()=>$('#links').classList.toggle('open');
const card=p=>`<article class="card"><img src="${img(p.image)}" alt="${esc(p.name)}"><div class="b"><span class="tag">${esc(p.category)}</span><h3>${esc(p.name)}</h3>
<div class="price">${inr(p.price)} / ${esc(p.unit)}</div><div class="muted">${p.quantity} ${esc(p.unit)} available · ${esc(p.location)}</div>
<div class="muted">By ${esc(p.farmer_name)} · <span title="rating">${stars(p.rating)}</span></div>
<div class="row"><button class="btn sm" data-add="${p.id}">Add to cart</button><a class="btn sm ghost" href="#/product/${p.id}">View details</a></div></div></article>`;
function wireAdd(){document.querySelectorAll('[data-add]').forEach(b=>b.onclick=async()=>{
 if(!user||user.role!=='buyer'){toast('Log in as a buyer to add items',1);location.hash='#/login/buyer';return}
 try{await api('/cart','POST',{product_id:b.dataset.add,quantity:1});toast('Added to cart')}catch(e){toast(e.message,1)}})}
const R={};
R['/']=async()=>{const p=(await api('/products')).slice(0,4);app.innerHTML=`<section class="hero"><div><h1>Fresh From Farmers to Your Table</h1>
<p>Buy vegetables, fruits, grains and more straight from the farmers who grow them. Restaurants, retailers, hotels and households all welcome.</p>
<div class="row"><a class="btn" href="#/market">Browse Marketplace</a><a class="btn rust" href="#/register/farmer">Become a Farmer</a><a class="btn ghost" href="#/register/buyer">Become a Buyer</a></div></div>
<img src="/images/logo.jpg" alt="Farm2Market basket of fresh produce"></section>
<h2>Featured products</h2><div class="grid">${p.map(card).join('')||'<p>No products yet.</p>'}</div>
<div class="two" style="margin-top:2rem"><div class="sum"><h3>For farmers</h3><p>Set your own prices, reach bulk buyers, and get paid online.</p></div><div class="sum"><h3>For buyers</h3><p>Know where your food comes from and pay securely with UPI, card or net banking.</p></div></div>`;wireAdd()};
R['/how']=async()=>app.innerHTML=`<h2>How Farm2Market works</h2><ol><li>Farmers list produce with price, quantity and location.</li><li>Buyers search, filter and add items to the cart.</li><li>Pay securely through Razorpay.</li><li>Farmers confirm, pack and ship; buyers track every step.</li></ol>`;
R['/market']=async()=>{const cats=await api('/categories');app.innerHTML=`<h2>Marketplace</h2><div class="filters"><input id="fq" placeholder="Search products">
<select id="fc"><option value="">All categories</option>${cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
<input id="fmin" type="number" placeholder="Min ₹"><input id="fmax" type="number" placeholder="Max ₹"><input id="floc" placeholder="Location"></div><div id="res" class="grid"></div>`;
 const load=async()=>{const q=new URLSearchParams({q:$('#fq').value,category:$('#fc').value,min:$('#fmin').value,max:$('#fmax').value,location:$('#floc').value});
  const p=await api('/products?'+q);$('#res').innerHTML=p.map(card).join('')||'<p>No products match your filters.</p>';wireAdd()};
 document.querySelectorAll('.filters input,.filters select').forEach(e=>e.oninput=load);load()};
R['/product']=async id=>{const p=await api('/products/'+id);app.innerHTML=`<div class="two"><img style="width:100%;border-radius:16px" src="${img(p.image)}" alt="${esc(p.name)}"><div><h2>${esc(p.name)}</h2>
<div class="price">${inr(p.price)} / ${esc(p.unit)}</div><p>${esc(p.description)}</p><p class="muted">Farmer: ${esc(p.farmer_name)} (${esc(p.farm_name||'')}) · ${esc(p.location)}<br>${p.quantity} ${esc(p.unit)} available · ${stars(p.rating)} (${p.reviews})</p>
<button class="btn" data-add="${p.id}">Add to cart</button></div></div><h3>Reviews</h3>${p.reviewList.map(r=>`<p><b>${esc(r.name)}</b> ${stars(r.rating)}<br>${esc(r.comment)}</p>`).join('')||'<p class="muted">No reviews yet.</p>'}`;wireAdd()};
R['/register']=async role=>{app.innerHTML=`<h2 style="text-align:center">${role==='farmer'?'Farmer':'Buyer'} registration</h2><form class="box" id="f"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
<label>Phone (10 digits)<input name="phone" pattern="\\d{10}"></label><label>Password (8+ characters)<input name="password" type="password" minlength="8" required></label>
${role==='farmer'?'<label>Farm name<input name="farm_name"></label><label>Location<input name="location" required></label>':'<label>Buyer type<select name="buyer_type"><option>household</option><option>restaurant</option><option>retailer</option><option>supermarket</option><option>hotel</option><option>hostel</option></select></label>'}
<button class="btn">Create account</button><p class="err" id="e"></p></form>`;
 $('#f').onsubmit=async e=>{e.preventDefault();try{user=await api('/auth/register','POST',{...form(e.target),role});nav();location.hash=role==='farmer'?'#/farmer':'#/market'}catch(x){$('#e').textContent=x.message}}};
R['/login']=async role=>{app.innerHTML=`<h2 style="text-align:center">${role==='farmer'?'Farmer':'Buyer'} login</h2><form class="box" id="f"><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label>
<button class="btn">Log in</button><p class="err" id="e"></p><a href="#/register/${role}">Create an account</a></form>`;
 $('#f').onsubmit=async e=>{e.preventDefault();try{user=await api('/auth/login','POST',{...form(e.target),role});nav();location.hash=role==='farmer'?'#/farmer':'#/market'}catch(x){$('#e').textContent=x.message}}};
R['/farmer']=async()=>{const[st,pr,od]=await Promise.all([api('/farmer/stats'),api('/products/mine'),api('/farmer/orders')]);
 app.innerHTML=`<h2>Farmer dashboard</h2><div class="stats"><div class="stat"><b>${inr(st.earnings)}</b>Total earnings</div><div class="stat"><b>${st.orders}</b>Paid orders</div><div class="stat"><b>${pr.length}</b>Products</div></div>
<a class="btn" href="#/add">Add product</a><h3>My products</h3><div class="tbl"><table><tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>${pr.map(p=>`<tr><td>${esc(p.name)}</td><td>${inr(p.price)}</td><td>${p.quantity} ${esc(p.unit)}</td><td><a class="btn sm ghost" href="#/add/${p.id}">Edit</a> <button class="btn sm danger" data-del="${p.id}">Delete</button></td></tr>`).join('')}</table></div>
<h3>Incoming orders</h3><div class="tbl"><table><tr><th>#</th><th>Item</th><th>Qty</th><th>Deliver to</th><th>Status</th></tr>${od.map(o=>`<tr><td>${o.order_id}</td><td>${esc(o.name)}</td><td>${o.quantity}</td><td>${esc(o.full_name)}, ${esc(o.address)}, ${esc(o.city)} (${esc(o.phone)})</td>
<td><select data-st="${o.item_id}">${['Placed','Confirmed','Packed','Shipped','Delivered'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>`;
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this product?')){await api('/products/'+b.dataset.del,'DELETE');route()}});
 document.querySelectorAll('[data-st]').forEach(s=>s.onchange=async()=>{try{await api('/farmer/orders/'+s.dataset.st,'PATCH',{status:s.value});toast('Status updated')}catch(e){toast(e.message,1)}})};
R['/add']=async id=>{const cats=await api('/categories'),p=id?await api('/products/'+id):{};app.innerHTML=`<h2 style="text-align:center">${id?'Edit':'Add'} product</h2><form class="box" id="f"><label>Name<input name="name" value="${esc(p.name)}" required></label>
<label>Category<select name="category_id">${cats.map(c=>`<option value="${c.id}" ${c.id===p.category_id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>Description<textarea name="description">${esc(p.description)}</textarea></label>
<label>Price (₹)<input name="price" type="number" step="0.01" min="0.01" value="${p.price||''}" required></label><label>Unit<select name="unit"><option>kg</option><option>dozen</option><option>litre</option><option>piece</option></select></label>
<label>Available quantity<input name="quantity" type="number" step="0.01" min="0" value="${p.quantity??''}" required></label><label>Location<input name="location" value="${esc(p.location)}"></label>
<label>Image (JPG/PNG/WebP, max 2 MB)<input name="image" type="file" accept="image/*"></label><button class="btn">Save product</button><p class="err" id="e"></p></form>`;
 $('#f').onsubmit=async e=>{e.preventDefault();try{await api(id?'/products/'+id:'/products',id?'PUT':'POST',new FormData(e.target));toast('Saved');location.hash='#/farmer'}catch(x){$('#e').textContent=x.message}}};
R['/cart']=async()=>{const c=await api('/cart');app.innerHTML=`<h2>Shopping cart</h2><div class="two"><div class="tbl"><table><tr><th>Product</th><th>Farmer</th><th>Qty</th><th>Price</th><th>Subtotal</th><th></th></tr>
${c.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.farmer_name)}</td><td><input type="number" min="0.5" step="0.5" max="${i.stock}" value="${i.quantity}" data-q="${i.id}" style="width:80px"></td><td>${inr(i.price)}/${esc(i.unit)}</td><td>${inr(i.price*i.quantity)}</td><td><button class="btn sm danger" data-rm="${i.id}">Remove</button></td></tr>`).join('')}</table></div>
<div class="sum"><div><span>Subtotal</span><b>${inr(c.subtotal)}</b></div><div><span>Delivery (free over ₹500)</span><b>${inr(c.delivery)}</b></div><div><span>Total</span><b>${inr(c.total)}</b></div>
${c.items.length?'<a class="btn" href="#/checkout">Proceed to Checkout</a>':'<p class="muted">Your cart is empty.</p>'}</div></div>`;
 document.querySelectorAll('[data-q]').forEach(i=>i.onchange=async()=>{try{await api('/cart/'+i.dataset.q,'PUT',{quantity:i.value});route()}catch(e){toast(e.message,1)}});
 document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{await api('/cart/'+b.dataset.rm,'DELETE');route()})};
R['/checkout']=async()=>{const c=await api('/cart');if(!c.items.length){location.hash='#/cart';return}
 app.innerHTML=`<h2>Checkout</h2><div class="two"><form id="f" class="box" style="margin:0;max-width:none"><label>Full name<input name="full_name" value="${esc(user.name)}" required></label><label>Phone<input name="phone" pattern="\\d{10}" required></label><label>Email<input name="email" type="email" required></label>
<label>Delivery address<textarea name="address" required></textarea></label><label>City<input name="city" required></label><label>State<input name="state" required></label><label>Pincode<input name="pincode" pattern="\\d{6}" required></label>
<button class="btn rust" id="pay">Pay Now</button><p class="err" id="e"></p></form><div class="sum"><h3>Order summary</h3>${c.items.map(i=>`<div><span>${esc(i.name)} × ${i.quantity}</span><span>${inr(i.price*i.quantity)}</span></div>`).join('')}
<div><span>Subtotal</span><span>${inr(c.subtotal)}</span></div><div><span>Delivery</span><span>${inr(c.delivery)}</span></div><div><b>Total</b><b>${inr(c.total)}</b></div></div></div>`;
 $('#f').onsubmit=async e=>{e.preventDefault();$('#pay').disabled=true;try{const o=await api('/payments/create-order','POST',form(e.target));
  const rz=new Razorpay({key:o.keyId,amount:o.amount,currency:'INR',name:'Farm2Market',description:'Order #'+o.orderId,order_id:o.razorpayOrderId,prefill:{name:e.target.full_name.value,email:e.target.email.value,contact:e.target.phone.value},theme:{color:'#1F5E2A'},
   handler:async r=>{try{const v=await api('/payments/verify','POST',r);location.hash='#/confirmation/'+v.orderId}catch(x){toast(x.message,1);location.hash='#/orders'}},
   modal:{ondismiss:async()=>{await api('/payments/failed','POST',{razorpay_order_id:o.razorpayOrderId,cancelled:true}).catch(()=>{});toast('Payment cancelled',1);$('#pay').disabled=false}}});
  rz.on('payment.failed',async r=>{await api('/payments/failed','POST',{razorpay_order_id:o.razorpayOrderId}).catch(()=>{});toast('Payment failed: '+(r.error.description||'try again'),1);$('#pay').disabled=false});rz.open()}
  catch(x){$('#e').textContent=x.message;$('#pay').disabled=false}}};
R['/confirmation']=async id=>app.innerHTML=`<div class="box" style="text-align:center"><h2>Order confirmed</h2><p>Payment received for order #${esc(id)}. The farmers have been notified.</p><a class="btn" href="#/orders">Track my order</a></div>`;
R['/orders']=async()=>{const o=await api('/orders');app.innerHTML=`<h2>My orders</h2><div class="tbl"><table><tr><th>Order</th><th>Item</th><th>Qty</th><th>Payment</th><th>Status</th><th>Review</th></tr>${o.map(i=>`<tr><td>#${i.order_id}</td><td>${esc(i.name)}</td><td>${i.quantity}</td><td>${i.payment_status}</td><td>${i.status}</td>
<td>${i.payment_status==='Paid'?`<button class="btn sm ghost" data-rv="${i.product_id}">Rate</button>`:''}</td></tr>`).join('')}</table></div>`;
 document.querySelectorAll('[data-rv]').forEach(b=>b.onclick=async()=>{const r=prompt('Rating 1-5');if(!r)return;try{await api('/reviews','POST',{product_id:b.dataset.rv,rating:r,comment:prompt('Comment (optional)')||''});toast('Thanks for your review')}catch(e){toast(e.message,1)}})};
R['/buyer']=R['/orders'];
async function route(){const[,k,a]=location.hash.slice(1).split('/'),key='/'+(k||'');const h=R[key]||R['/'];
 const need={'/farmer':'farmer','/add':'farmer','/cart':'buyer','/checkout':'buyer','/orders':'buyer','/buyer':'buyer','/confirmation':'buyer'}[key];
 if(need&&(!user||user.role!==need)){location.hash='#/login/'+need;return}
 try{await h(a)}catch(e){app.innerHTML=`<p class="err">${esc(e.message)}</p>`}window.scrollTo(0,0)}
addEventListener('hashchange',route);
(async()=>{try{user=await api('/auth/me')}catch{}nav();route()})();
