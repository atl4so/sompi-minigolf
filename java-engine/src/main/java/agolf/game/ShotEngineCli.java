package agolf.game;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class ShotEngineCli {
    public static void main(String[] args) throws Exception {
        System.out.println(ShotEngineCore.simulate(readInput()));
    }

    private static Map<String, String> readInput() throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        Map<String, String> input = new HashMap<>();
        String line;
        while ((line = reader.readLine()) != null) {
            int split = line.indexOf('=');
            if (split <= 0) {
                continue;
            }
            input.put(line.substring(0, split), line.substring(split + 1));
        }
        return input;
    }
}
