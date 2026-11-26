fetch('http://127.0.0.1:47821/ping')
  .then((r) => r.json())
  .then((d) => {
    const el = document.getElementById('st');
    el.textContent = `● Bağlı — ${d.app} v${d.version}`;
    el.className = 'status ok';
  })
  .catch(() => {
    const el = document.getElementById('st');
    el.textContent = '● Hayye Market masaüstü uygulaması kapalı';
    el.className = 'status err';
  });
