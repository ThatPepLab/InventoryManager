(() => {
  const API = String(window.INVENTORY_API_URL || "").replace(/\/$/, "");
  const state = { password: sessionStorage.getItem("inventoryManagerPassword") || "", items: [], history: [], filter: "all", search: "", catalogOptions: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const OIL_PATTERN=/^(nandrolone decanoate|boldenone undecylenate|nandrolone phenylpropionate|methenolone enanthate|testosterone cypionate|testosterone enanthate|testosterone propionate|trenbolone acetate|trenbolone enanthate|drostanolone propionate|drostanolone enanthate|testosterone blend)$/i;
  const RETAIL_CATEGORIES=[
    ["Weight Loss",/semaglutide|tirzepatide|trizepatide|glp-?3rt|cagrilintide|cagilintide|mazdutide|survodutide|eloralintide|adipotide|aod-?9604|hgh fragment|lemon bottle|lipo lab|lipo-[bc]|lipo-c|fat blaster|5-amino/i],
    ["Energy & Metabolic",/mots|ss-?31|nad\+|aicar|slu-?pp|l-carnitine|lc120|lc216|mic\b|superhuman|humanin|vitamin b12/i],
    ["Recovery & Repair",/bpc|tb500|tb-?500|glow|klow|kpv|ll-?37|ara-?290|cartalax|bronchogen|cardiogen|vesugen|lysine-proline-valine/i],
    ["Growth & Performance",/hgh|cjc|ghrp|ipamorelin|tesamorelin|sermorelin|igf|mgf|follistatin|ace-?031|gdf-?8|mk677|epo\b/i],
    ["Cognitive & Mood",/semax|selank|dihexa|dsip|pe-?22|pinealon|cerebrolysin|cortagen|adamax|melatonin|relaxation/i],
    ["Sexual & Hormone",/pt-?141|oxytocin|hcg\b|hmg\b|kisspeptin|gonadorelin|alprostadil|testagen|testosterone/i],
    ["Skin, Hair & Beauty",/melanotan|snap-?8|matrixyl|ahk-?cu|ghk-?cu|healthy hair|botulinum|hyaluronic/i],
    ["Immune & Wellness",/thym|epithalon|glutathione|foxo|pnc|vilon|crystagen|vip\b|vasoactive|dermorphin/i],
    ["Supplies",/water|saline|phosphate buffered|acetic acid/i]
  ];
  const strengthNumber=value=>Number.parseFloat(value)||0;
  const retailStrengthAllowed=(name,strength)=>{const amount=strengthNumber(strength);if(/^glp-?3rt$|^retatrutide$/i.test(name))return amount<40;if(/^glp-?2(?:tr|tz)?$|^tirzepatide$|^trizepatide$/i.test(name))return amount<=60;return true};
  const retailCategory=name=>RETAIL_CATEGORIES.find(([,test])=>test.test(name))?.[0]||"Other";
  const productItems=product=>Array.isArray(product?.items)?product.items:[...(Array.isArray(product?.china)?product.china:[]),...(Array.isArray(product?.usa)?product.usa:[])];
  const isInternalCatalogItem=(product,item)=>OIL_PATTERN.test(String(product?.name||"").trim())||String(item?.packageUnit||"").trim().toLowerCase()==="tablet";
  const visibleRetailCatalogItem=(product,item)=>{const name=String(product?.name||"").trim(),category=retailCategory(name);if(isInternalCatalogItem(product,item))return false;if(category==="Other")return false;if(category==="Supplies"&&!/^bac water$/i.test(name))return false;return retailStrengthAllowed(name,item?.strength)};
  const catalogOptionFor=(product,strength)=>state.catalogOptions.find(option=>option.product===product&&option.strength===strength);
  function populateStrengthOptions(productName,current=""){const input=$("productStrength");if(!input)return;let list=document.getElementById("inventoryStrengthOptions");if(!list){list=document.createElement("datalist");list.id="inventoryStrengthOptions";document.body.appendChild(list);input.setAttribute("list",list.id)}const options=state.catalogOptions.filter(option=>option.product===productName);list.innerHTML=options.map(option=>"<option value=\""+esc(option.strength)+"\">"+esc(option.scope)+" · "+esc(option.category)+"</option>").join("");if(current)input.value=current}
  function setupCatalogInputs(){const productInput=$("productName"),strengthInput=$("productStrength");if(!productInput||!strengthInput)return;let list=document.getElementById("inventoryProductOptions");if(!list){list=document.createElement("datalist");list.id="inventoryProductOptions";document.body.appendChild(list);productInput.setAttribute("list",list.id)}const products=[...new Map(state.catalogOptions.map(option=>[option.product,option])).values()];list.innerHTML=products.map(option=>"<option value=\""+esc(option.product)+"\">"+esc(option.scope)+" · "+esc(option.category)+"</option>").join("");productInput.addEventListener("change",()=>{populateStrengthOptions(productInput.value,"");const first=state.catalogOptions.find(option=>option.product===productInput.value);if(first&&$("productCategory"))$("productCategory").value=first.category})}
  async function loadCatalogOptions(){try{const response=await fetch("https://raw.githubusercontent.com/ThatPepLab/Wholesale/main/catalog-data.json?updated="+Date.now(),{cache:"no-store"});if(!response.ok)throw new Error("Catalog unavailable");const products=await response.json(),options=[];for(const product of Array.isArray(products)?products:[]){for(const item of productItems(product)){if(!item?.strength)continue;const internal=isInternalCatalogItem(product,item);if(!internal&&!visibleRetailCatalogItem(product,item))continue;options.push({product:product.name,strength:item.strength,category:internal?(OIL_PATTERN.test(product.name)?"Oil Based":"Pills / Tablets"):retailCategory(product.name),scope:internal?"Internal Only":"Retail",internalOnly:internal})}}state.catalogOptions=[...new Map(options.map(option=>[option.product+"|"+option.strength,option])).values()].sort((a,b)=>a.product.localeCompare(b.product,undefined,{numeric:true})||strengthNumber(a.strength)-strengthNumber(b.strength));setupCatalogInputs()}catch(error){console.warn("Catalog options unavailable",error)}}

  const toast = (message, error=false) => {
    const el = $("toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 2600);
  };

  async function request(path, options={}) {
    if (!API) throw new Error("The secure API has not been connected yet.");
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "X-Manager-Password": state.password, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function statusFor(item) {
    if (Number(item.quantity) <= 0) return ["Out of Stock", "out"];
    if (Number(item.quantity) === 1) return ["Only 1 Left", "low"];
    return ["In Stock", "in"];
  }

  function formatDate(value) {
    if (!value) return "Date not set";
    return new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric" }).format(new Date(`${value}T12:00:00`));
  }
  function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(new Date(value));
  }

  function render() {
    const total = state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const low = state.items.filter(i => Number(i.quantity) > 0 && Number(i.quantity) <= 2).length;
    const out = state.items.filter(i => Number(i.quantity) <= 0).length;
    const incoming = state.items.filter(i => i.moreOnWay).length;
    $("summary").innerHTML = [
      [total,"Total units"],[state.items.length,"Product options"],[low + out,"Low / out"],[incoming,"On the way"]
    ].map(([n,label]) => `<article class="summary-card card"><strong>${n}</strong><span>${label}</span></article>`).join("");

    const q = state.search.toLowerCase();
    const items = state.items.filter(item => {
      const matchesSearch = [item.product,item.strength,item.sku,item.category].join(" ").toLowerCase().includes(q);
      const n = Number(item.quantity || 0);
      const matchesFilter = state.filter === "all" || (state.filter === "low" && n > 0 && n <= 2) || (state.filter === "out" && n <= 0) || (state.filter === "incoming" && item.moreOnWay);
      return matchesSearch && matchesFilter;
    });
    $("resultCount").textContent = `${items.length} of ${state.items.length} shown`;
    $("productGrid").innerHTML = items.length ? items.map(item => {
      const [label, cls] = statusFor(item);
      return `<article class="product-card" data-id="${esc(item.id)}">
        <div class="product-top"><div><div class="product-name">${esc(item.product)} · ${esc(item.strength)}</div><div class="meta">${esc(item.category || "Uncategorized")}${item.sku ? ` · SKU ${esc(item.sku)}` : ""}</div></div><div class="qty"><strong>${Number(item.quantity || 0)}</strong><span>AVAILABLE</span></div></div>
        <div class="badges"><span class="badge ${cls}">${label}</span>${item.internalOnly ? `<span class="badge internal">INTERNAL ONLY</span>` : ""}${item.moreOnWay ? `<span class="badge incoming">MORE ON THE WAY</span>` : ""}</div>
        ${item.moreOnWay ? `<div class="arrival"><strong>${Number(item.incomingQuantity || 0)} incoming</strong> · Expected ${formatDate(item.expectedArrival)}</div>` : ""}
        <div class="quick-actions">
          <button class="sold" data-action="sold">−1 Sold</button>
          <button class="restock" data-action="restock">+1 Restock</button>
          ${item.moreOnWay ? `<button data-action="receive">Receive</button>` : `<button data-action="adjust">Adjust</button>`}
          <button data-action="edit">Edit</button>
        </div>
      </article>`;
    }).join("") : `<div class="empty card">No products match this view.</div>`;

    $("historyList").innerHTML = state.history.length ? state.history.slice(0,25).map(entry => {
      const delta = Number(entry.delta || 0); const sign = delta > 0 ? "+" : "";
      return `<div class="history-row"><div><p><strong>${esc(entry.label || entry.action)}</strong> · ${esc(entry.actionLabel || entry.action)}</p><small>${formatTime(entry.timestamp)}${entry.note ? ` · ${esc(entry.note)}` : ""}</small></div><div class="delta ${delta > 0 ? "plus" : delta < 0 ? "minus" : ""}">${delta ? `${sign}${delta}` : "Updated"}</div></div>`;
    }).join("") : `<div class="empty">No adjustments recorded yet.</div>`;
    $("undoButton").disabled = !state.history.some(h => !h.undone && h.undoable);
  }

  async function load() {
    const data = await request("/inventory");
    state.items = data.items || []; state.history = data.history || [];
    $("loginView").hidden = true; $("appView").hidden = false; render();
  }

  async function mutate(action, payload={}) {
    const data = await request("/inventory", { method:"POST", body:JSON.stringify({ action, ...payload }) });
    state.items = data.items || []; state.history = data.history || []; render(); toast(data.message || "Inventory updated");
  }

  function openItem(item={}) {
    $("dialogTitle").textContent = item.id ? "Edit product" : "Add product";
    $("itemId").value = item.id || ""; $("productName").value = item.product || ""; populateStrengthOptions(item.product || "", item.strength || ""); $("productStrength").value = item.strength || "";
    $("productSku").value = item.sku || ""; $("productCategory").value = item.category || ""; $("productQuantity").value = Number(item.quantity || 0);
    $("moreOnWay").checked = Boolean(item.moreOnWay); $("incomingQuantity").value = item.incomingQuantity || ""; $("expectedArrival").value = item.expectedArrival || "";
    $("incomingFields").hidden = !item.moreOnWay; $("itemDialog").showModal();
  }

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault(); state.password = $("password").value;
    try { await load(); sessionStorage.setItem("inventoryManagerPassword", state.password); }
    catch (error) { toast(error.message, true); }
  });
  $("logoutButton").addEventListener("click", () => { sessionStorage.removeItem("inventoryManagerPassword"); location.reload(); });
  $("refreshButton").addEventListener("click", () => load().then(() => toast("Inventory refreshed")).catch(e => toast(e.message,true)));
  $("searchInput").addEventListener("input", e => { state.search = e.target.value; render(); });
  $("filters").addEventListener("click", e => { const b=e.target.closest("[data-filter]"); if(!b)return; state.filter=b.dataset.filter; document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===b)); render(); });
  $("addProductButton").addEventListener("click", () => openItem());
  $("moreOnWay").addEventListener("change", e => { $("incomingFields").hidden = !e.target.checked; });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

  $("productGrid").addEventListener("click", async e => {
    const button=e.target.closest("[data-action]"); if(!button)return; const card=button.closest("[data-id]"); const item=state.items.find(i=>i.id===card.dataset.id); if(!item)return;
    try {
      if(button.dataset.action==="sold") await mutate("adjust",{id:item.id,delta:-1,note:"Sold"});
      if(button.dataset.action==="restock") await mutate("adjust",{id:item.id,delta:1,note:"Restocked"});
      if(button.dataset.action==="receive") { if(confirm(`Receive ${item.incomingQuantity || 0} incoming units for ${item.product} ${item.strength}?`)) await mutate("receive",{id:item.id}); }
      if(button.dataset.action==="edit") openItem(item);
      if(button.dataset.action==="adjust") { $("adjustId").value=item.id; $("adjustTitle").textContent=`Adjust ${item.product} ${item.strength}`; $("adjustDelta").value=""; $("adjustNote").value=""; $("adjustDialog").showModal(); }
    } catch(error){toast(error.message,true)}
  });

  $("itemForm").addEventListener("submit", async e => {
    e.preventDefault(); const incoming=$("moreOnWay").checked;
    if(incoming && (!Number($("incomingQuantity").value) || !$("expectedArrival").value)){toast("Enter incoming quantity and expected arrival.",true); return;}
    try { const product=$("productName").value.trim(),strength=$("productStrength").value.trim(),catalog=catalogOptionFor(product,strength),internalOnly=Boolean(catalog?.internalOnly)||/^oil based$/i.test($("productCategory").value.trim())||/pill|tablet/i.test($("productCategory").value.trim()); await mutate("save",{ item:{id:$("itemId").value||undefined,product,strength,sku:$("productSku").value.trim(),category:$("productCategory").value.trim()||(catalog?.category||""),quantity:Number($("productQuantity").value),internalOnly,moreOnWay:incoming,incomingQuantity:incoming?Number($("incomingQuantity").value):0,expectedArrival:incoming?$("expectedArrival").value:""} }); $("itemDialog").close(); }
    catch(error){toast(error.message,true)}
  });
  $("adjustForm").addEventListener("submit", async e => { e.preventDefault(); try{await mutate("adjust",{id:$("adjustId").value,delta:Number($("adjustDelta").value),note:$("adjustNote").value.trim()});$("adjustDialog").close();}catch(error){toast(error.message,true)} });
  $("undoButton").addEventListener("click", async () => { if(confirm("Undo the most recent quantity change?")){try{await mutate("undo");}catch(error){toast(error.message,true)}} });

  loadCatalogOptions();
  if(!API){ $("setupMessage").hidden=false; $("setupMessage").textContent="The manager interface is installed. Connect the secure API once to enable live inventory changes."; }
  else if(state.password){ load().catch(() => { sessionStorage.removeItem("inventoryManagerPassword"); state.password=""; }); }
})();
