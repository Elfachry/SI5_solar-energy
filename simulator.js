async function sendReading() {
  const lux = 20000 + Math.random() * 60000;
  const volt = 4 + (lux / 80000) * 2;
  const amp = (lux / 80000) * 0.5;

  const data = { lux, volt, amp };

  await fetch("http://localhost:3000/api/readings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  console.log("send", data);
}

setInterval(sendReading, 2000);
sendReading();
