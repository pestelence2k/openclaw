# Hosted only. Sample OS resident memory for all Chromium processes in isolated job.
# RSS sum can double-count shared pages; PSS is proportional. Neither is JS heap.
import pathlib, subprocess, sys, time, json
command = sys.argv[1:]
peak_rss = peak_pss = peak_count = samples = 0
start = time.monotonic()
process = subprocess.Popen(command)
while process.poll() is None:
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
    peak_rss, peak_pss, peak_count = max(rss, peak_rss), max(pss, peak_pss), max(count, peak_count)
    samples += 1
    time.sleep(0.02)
print("::notice title=Chromium OS memory::" + json.dumps({"peakRssKiB":peak_rss,"peakPssKiB":peak_pss,"peakProcesses":peak_count,"samples":samples,"seconds":round(time.monotonic()-start,2),"exit":process.returncode,"scope":"whole isolated Chromium tree, includes synthetic canvas generation and decode; 20ms requested sampling, not a guaranteed instantaneous peak"}))
raise SystemExit(process.returncode)
