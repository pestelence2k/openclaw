# Hosted only: format exactly product paths and export exact formatter-only diff.
import base64, hashlib, pathlib, subprocess, zlib
root = pathlib.Path("ui/src/pages/chat/components")
names = ["chat-attachment-image.ts", "chat-attachment-reads.ts", "chat-attachments.ts", "chat-attachments.test.tsx", "chat-attachment-dimensions.browser.test.ts"]
paths = [str(root / name) for name in names]
subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "19082a44a49109a0d93645b68caa0cb6a10b8837"], check=True)
subprocess.run(["git", "add", "--", *paths], check=True)
subprocess.run(["pnpm", "format", *paths], check=True)
diff = subprocess.check_output(["git", "diff", "--", *paths])
encoded = base64.b64encode(zlib.compress(diff)).decode()
print("::notice title=Formatter digest::sha256=" + hashlib.sha256(diff).hexdigest())
for index in range(0, len(encoded), 2800):
    print("::notice title=Formatter chunk " + str(index // 2800) + "::" + encoded[index:index+2800])
subprocess.run(["git", "add", "--", *paths], check=True)
for name in paths:
    print("::notice title=Formatted source::" + name + " sha256=" + hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest())
