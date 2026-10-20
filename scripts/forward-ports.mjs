// Relais TCP localhost → hôte Docker, pour lancer les E2E dans le conteneur Playwright
// (scripts/e2e-docker.sh) avec les mêmes adresses que sur la machine (APP_URL, S3, Mailpit).
import net from "node:net";

const target = process.env.FORWARD_HOST ?? "host.docker.internal";
const ports = (process.env.FORWARD_PORTS ?? "3000,9000,8025,5432").split(",").map(Number);

for (const port of ports) {
  net
    .createServer((client) => {
      const upstream = net.connect(port, target);
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
    })
    .listen(port, "127.0.0.1");
}
process.stdout.write(`Relais ${ports.join(", ")} → ${target}\n`);
