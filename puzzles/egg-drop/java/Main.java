import java.io.*;
import java.util.*;

// Reads one critical floor (0-100) per line and plays it out with Strategy.nextDrop,
// using two eggs. Prints one line per floor: the floors dropped from, tab-separated.
// Stops a case at the first floor that can't be dropped from, so the page can say why.
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
            int crit = Integer.parseInt(line.trim());
            int safe = 0, broken = 101, eggs = 2;
            List<String> drops = new ArrayList<>();
            while (broken - safe > 1 && eggs > 0) {
                int f = Strategy.nextDrop(safe, broken, eggs);
                drops.add(String.valueOf(f));
                if (f <= safe || f >= broken) break;
                if (f > crit) { broken = f; eggs--; } else safe = f;
            }
            out.append(String.join("\t", drops)).append('\n');
        }
        answers.print(out);
        answers.flush();
    }
}
