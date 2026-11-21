# Hosted-only diagnostic runner. Captures only selected synthetic proof commands.
import subprocess, sys, time
label, separator, *command = sys.argv[1:]
if separator != "--" or not command:
    raise SystemExit("expected label -- command")
start = time.monotonic()
result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
elapsed = time.monotonic() - start
output = result.stdout
print(output, end="")
tail = output[-6000:]
def escape(value):
    return value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
print("::notice title=Proof " + label + "::" + escape(
    "exit=" + str(result.returncode) + "; seconds=" + str(round(elapsed, 2)) + "\n" + tail
))
raise SystemExit(result.returncode)
