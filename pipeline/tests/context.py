"""Put `pipeline/` on sys.path.

The pipeline modules import each other flat -- `import config as C`, `import
fetch` -- so they are only importable with the pipeline directory itself on the
path. Every test module imports this first.

Importing the pipeline must not touch the network: spec 0004's source
verification recorded all 7 modules importing offline in under 0.03s. Nothing
here may weaken that.
"""
import os
import sys

PIPELINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PIPELINE not in sys.path:
    sys.path.insert(0, PIPELINE)

TESTS = os.path.join(PIPELINE, "tests")
FIXTURES = os.path.join(TESTS, "fixtures")
