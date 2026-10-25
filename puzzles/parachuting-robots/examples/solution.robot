# Crawl left slowly until we find a parachute,
# then sprint left to catch the other robot.
crawl:
  left
  skipNext
  goto crawl
sprint:
  left
  goto sprint
