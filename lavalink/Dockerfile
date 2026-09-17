FROM ghcr.io/lavalink-devs/lavalink:4-alpine

# The container is capped at 1GB by the Railway plan. Left at JVM defaults,
# the heap alone can creep close to that ceiling under sustained multi-guild
# playback, and when the cgroup limit is hit the OS kills the process outright
# with no exception or log line to explain it (that's what was causing
# playback to just die with nothing in the logs). Capping the heap below the
# container limit — and asking the JVM to exit (loudly, with a log line) on
# its own OOM instead of getting silently killed — trades a hard silent kill
# for a smaller, logged, faster-recovering crash. It reduces how often this
# happens but can't eliminate it on a fixed 1GB container.
ENV JAVA_TOOL_OPTIONS="-Xmx640m -XX:MaxDirectMemorySize=256m -XX:+ExitOnOutOfMemoryError"

COPY application.yml /opt/Lavalink/application.yml
