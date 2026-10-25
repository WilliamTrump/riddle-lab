import java.io.*;
import java.util.*;

// Runs Strategy.guess down every lineup read from stdin (one lineup per line,
// hats separated by tabs) and prints what each prisoner said, one line per lineup.
// Anything the strategy prints itself is thrown away so it can't mix with the answers.
public class Main {
    public static void main(String[] args) throws IOException {
        PrintStream answers = System.out;
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            List<String> lineup = List.of(line.split("\t"));
            List<String> heard = new ArrayList<>();
            for (int i = 0; i < lineup.size(); i++) {
                List<String> seen = List.copyOf(lineup.subList(i + 1, lineup.size()));
                String g = Strategy.guess(seen, Collections.unmodifiableList(new ArrayList<>(heard)));
                heard.add(String.valueOf(g).replace('\t', ' ').replace('\n', ' '));
            }
            out.append(String.join("\t", heard)).append('\n');
        }
        answers.print(out);
        answers.flush();
    }
}
