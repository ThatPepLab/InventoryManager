(() => {
  const API = String(window.INVENTORY_API_URL || "").replace(/\/$/, "");
  const state = { password: sessionStorage.getItem("inventoryManagerPassword") || "", items: [], history: [], filter: "all", search: "" };
  const $ = (id) => document.getElementById(id);
  const esc = (value="") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

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
      [total,"Total vials"],[state.items.length,"Product options"],[low + out,"Low / out"],[incoming,"On the way"]
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
        <div class="badges"><span class="badge ${cls}">${label}</span>${item.moreOnWay ? `<span class="badge incoming">MORE ON THE WAY</span>` : ""}</div>
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
    $("itemId").value = item.id || ""; $("productName").value = item.product || ""; $("productStrength").value = item.strength || "";
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
    try { await mutate("save",{ item:{id:$("itemId").value||undefined,product:$("productName").value.trim(),strength:$("productStrength").value.trim(),sku:$("productSku").value.trim(),category:$("productCategory").value.trim(),quantity:Number($("productQuantity").value),moreOnWay:incoming,incomingQuantity:incoming?Number($("incomingQuantity").value):0,expectedArrival:incoming?$("expectedArrival").value:""} }); $("itemDialog").close(); }
    catch(error){toast(error.message,true)}
  });
  $("adjustForm").addEventListener("submit", async e => { e.preventDefault(); try{await mutate("adjust",{id:$("adjustId").value,delta:Number($("adjustDelta").value),note:$("adjustNote").value.trim()});$("adjustDialog").close();}catch(error){toast(error.message,true)} });
  $("undoButton").addEventListener("click", async () => { if(confirm("Undo the most recent quantity change?")){try{await mutate("undo");}catch(error){toast(error.message,true)}} });

  if(!API){ $("setupMessage").hidden=false; $("setupMessage").textContent="The manager interface is installed. Connect the secure API once to enable live inventory changes."; }
  else if(state.password){ load().catch(() => { sessionStorage.removeItem("inventoryManagerPassword"); state.password=""; }); }
})();
