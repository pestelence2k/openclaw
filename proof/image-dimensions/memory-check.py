# Hosted only: phase-aware whole Chromium-tree RSS/PSS, never JS heap alone.
import json, pathlib, subprocess, sys, threading, time
phase = "startup"
phases = {}
start = time.monotonic()
process = subprocess.Popen(sys.argv[1:], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
def output():
    global phase
    for line in process.stdout:
        if line.strip().startswith("MEMORY_PHASE "):
            phase = line.strip().split(" ", 1)[1]
        print(line, end="", flush=True)
reader = threading.Thread(target=output)
reader.start()
while process.poll() is None:
    current = phase
    rss = pss = count = 0
    for directory in pathlib.Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            name = (directory / "comm").read_text().strip()
            if not ("chrome" in name or "chromium" in name):
                continue
            count += 1
            for line in (directory / "status").read_text().splitlines():
                if line.startswith("VmRSS:"):
                    rss += int(line.split()[1])
            for line in (directory / "smaps_rollup").read_text().splitlines():
                if line.startswith("Pss:"):
                    pss += int(line.split()[1])
        except (OSError, ValueError):
            continue
    record = phases.setdefault(current, {"peakRssKiB":0, "peakPssKiB":0, "samples":0, "peakProcesses":0})
    record["peakRssKiB"] = max(rss, record["peakRssKiB"])
    record["peakPssKiB"] = max(pss, record["peakPssKiB"])
    record["peakProcesses"] = max(count, record["peakProcesses"])
    record["samples"] += 1
    time.sleep(0.02)
reader.join()
print("::notice title=Chromium OS memory::" + json.dumps({"phases":phases,"seconds":round(time.monotonic()-start,2),"exit":process.returncode,"scope":"whole isolated Chromium tree; stdout phase boundaries approximate; fixture memory may remain in preparation; RSS double-counts shared pages, PSS proportional; requested20ms sampling is not instantaneous peak or mobile safety proof"}))
raise SystemExit(process.returncode)
