package agolf.game;

import org.teavm.jso.JSExport;

public class ShotEngineModule {
    @JSExport
    public static String simulate(String inputLines) {
        try {
            return ShotEngineCore.simulate(inputLines);
        } catch (Throwable ignored) {
            return "{\"error\":\"shot-engine-failed\"}";
        }
    }
}
