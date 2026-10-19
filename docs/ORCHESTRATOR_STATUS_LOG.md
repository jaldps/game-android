# Orchestrator status (for resuming if context is lost)
Layout: web/ (assets) + android/ (WebView shell, builds via tools/apk.sh). SPEC.md = builder brief. CRITIC.md = critic brief.
Refs of originals in refs/<id>/. Old abandoned attempts archived in _old/ (ignore).
Loop per game: builder agent (background) -> reports -> fresh critic agent judges blind vs refs -> critique sent back to builder -> repeat until critic verdict = SHIP.
## Rounds log
- hole: builder round1 done (agent a4097eaf88dbb232e). blind.py got --crop option.
- 04:27 classifier outage blocked Agent/Bash. Pending: launch builders crowd/archer/downhill/sled/original + hole critic r1; hole thumb.jpg; early APK. Hub index.html written (reads games/<id>/meta.json {title,tagline,thumb,bestKey}).
- 10-19 13:33 launched builders: crowd a02492429ed11b521, archer a28dd896d1c80961d, downhill acc7f992bb9e8d43e, sled a86662f2deb06b3b8, original a622647a6b4c534a5; hole critic r1 a0b679ca4221efe3c. hole builder = a4097eaf88dbb232e.
- hole critic r1: NOT YET 2/6. forwarded to builder. shot timeouts raised to 150s.
