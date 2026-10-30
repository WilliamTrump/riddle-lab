import java.io.*;
import java.util.*;

// Reads one critical floor (0-100) per line and calls Strategy.findFloor with a
// Building for it. Prints one line per floor: the floors dropped from, comma-separated,
// then a tab and the answer, or a tab, "!", the Strategy.java line, a tab and the error.
// Anything the strategy prints itself is thrown away.
public class Main {
    public static void main(String[] args) throws IOException {
        PrintStream answers = System.out;
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            Building building = new Building(Integer.parseInt(line.trim()));
            String end;
            try {
                end = String.valueOf(Strategy.findFloor(building));
            } catch (RuntimeException | StackOverflowError e) {
                int at = 0;
                for (StackTraceElement f : e.getStackTrace()) {
                    if ("Strategy.java".equals(f.getFileName())) { at = f.getLineNumber(); break; }
                }
                String msg = e instanceof Building.RuleError ? e.getMessage() : e.toString();
                end = "!" + at + "\t" + msg.replace('\t', ' ').replace('\n', ' ');
            }
            StringJoiner drops = new StringJoiner(",");
            for (int f : building.drops) drops.add(String.valueOf(f));
            out.append(drops).append('\t').append(end).append('\n');
        }
        answers.print(out);
        answers.flush();
    }
}

// The museum, as seen by the strategy: building.drop(floor) returns true if the egg broke.
class Building {
    static class RuleError extends RuntimeException {
        RuleError(String message) { super(message); }
    }

    private final int crit;
    private int eggs = 2;
    final List<Integer> drops = new ArrayList<>();

    Building(int crit) { this.crit = crit; }

    boolean drop(int floor) {
        if (eggs == 0) throw new RuleError("Both replica eggs are already broken.");
        if (floor < 1 || floor > 100) throw new RuleError("drop() needs a floor from 1 to 100, but got " + floor + ".");
        if (drops.size() >= 200) throw new RuleError("More than 200 drops.");
        drops.add(floor);
        if (floor > crit) { eggs--; return true; }
        return false;
    }
}
