package agolf.game;

import agolf.Seed;
import agolf.SynchronizedBool;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ShotEngineCore {
    private static final int GAME_WIDTH = 735;
    private static final int GAME_HEIGHT = 375;
    private static final int MAP_WIDTH = 49;
    private static final int MAP_HEIGHT = 25;
    private static final int MAGNET_WIDTH = GAME_WIDTH / 5;
    private static final int MAGNET_HEIGHT = GAME_HEIGHT / 5;

    private ShotEngineCore() {}

    public static String simulate(String inputLines) {
        return simulate(parseInputLines(inputLines));
    }

    public static String simulate(Map<String, String> input) {
        int playerCount = intValue(input, "playerCount", 1);
        int currentPlayerId = intValue(input, "currentPlayerId", 0);
        int playerId = intValue(input, "playerId", currentPlayerId);
        double[] playerX = doubleArray(input, "playerX", playerCount, 367.5D);
        double[] playerY = doubleArray(input, "playerY", playerCount, 187.5D);
        double[] speedX = doubleArray(input, "speedX", playerCount, 0.0D);
        double[] speedY = doubleArray(input, "speedY", playerCount, 0.0D);
        Seed seed =
                input.containsKey("seedRaw") ? Seed.fromRaw(longValue(input, "seedRaw", 0L)) : new Seed(longValue(input, "seed", 0L));

        if (input.containsKey("mouseX") && input.containsKey("mouseY")) {
            applyStrokePower(
                    playerId,
                    playerX,
                    playerY,
                    speedX,
                    speedY,
                    doubleValue(input, "mouseX", playerX[playerId]),
                    doubleValue(input, "mouseY", playerY[playerId]),
                    intValue(input, "shootingMode", 0),
                    seed);
        }

        HackedShot shot = new HackedShot(
                playerCount,
                intValue(input, "waterMode", 0),
                intValue(input, "collisionMode", 1),
                currentPlayerId,
                playerId,
                doubleValue(input, "startPositionX", -1.0D),
                doubleValue(input, "startPositionY", -1.0D),
                doubleValue(input, "bounciness", 1.0D),
                doubleValue(input, "magnetSpeed", 1.0D),
                doubleArray(input, "resetPositionX", playerCount, -1.0D),
                doubleArray(input, "resetPositionY", playerCount, -1.0D),
                parseTeleports(input.get("teleportStarts")),
                parseTeleports(input.get("teleportExits")),
                parseMagnetMap(input.get("magnetMap")),
                playerX,
                playerY,
                speedX,
                speedY,
                booleanArray(input, "simulatePlayer", playerCount, true),
                synchronizedBoolArray(input, "onHoleSync", playerCount),
                booleanValue(input, "isLocalPlayer", true),
                booleanArray(input, "playerActive", playerCount, true),
                seed,
                intValue(input, "maxPhysicsIterations", 2),
                false,
                parseCollisionMap(input.get("collisionMap")),
                parseMapTiles(input.get("mapTiles")));

        shot.run();
        return toJson(shot);
    }

    private static Map<String, String> parseInputLines(String inputLines) {
        Map<String, String> input = new HashMap<>();
        int start = 0;
        while (start <= inputLines.length()) {
            int end = inputLines.indexOf('\n', start);
            if (end < 0) {
                end = inputLines.length();
            }
            String line = inputLines.substring(start, end);
            int split = line.indexOf('=');
            if (split > 0) {
                input.put(line.substring(0, split), line.substring(split + 1));
            }
            start = end + 1;
        }
        return input;
    }

    @SuppressWarnings("unchecked")
    private static List<double[]>[] parseTeleports(String value) {
        List<double[]>[] groups = new List[] {new ArrayList<>(), new ArrayList<>(), new ArrayList<>(), new ArrayList<>()};
        if (value == null || value.isEmpty()) {
            return groups;
        }
        String[] groupParts = value.split("\\|", -1);
        for (int i = 0; i < groups.length && i < groupParts.length; i++) {
            if (groupParts[i].isEmpty()) {
                continue;
            }
            String[] entries = groupParts[i].split(";");
            for (String entry : entries) {
                String[] xy = entry.split(":");
                if (xy.length == 2) {
                    groups[i].add(new double[] {Double.parseDouble(xy[0]), Double.parseDouble(xy[1])});
                }
            }
        }
        return groups;
    }

    private static short[][][] parseMagnetMap(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        byte[] bytes = Base64.getDecoder().decode(value);
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN);
        short[][][] magnetMap = new short[MAGNET_WIDTH][MAGNET_HEIGHT][2];
        for (int y = 0; y < MAGNET_HEIGHT; y++) {
            for (int x = 0; x < MAGNET_WIDTH; x++) {
                magnetMap[x][y][0] = buffer.getShort();
                magnetMap[x][y][1] = buffer.getShort();
            }
        }
        return magnetMap;
    }

    private static byte[][] parseCollisionMap(String value) {
        byte[] bytes = Base64.getDecoder().decode(value);
        byte[][] collisionMap = new byte[GAME_WIDTH][GAME_HEIGHT];
        for (int y = 0; y < GAME_HEIGHT; y++) {
            for (int x = 0; x < GAME_WIDTH; x++) {
                collisionMap[x][y] = bytes[y * GAME_WIDTH + x];
            }
        }
        return collisionMap;
    }

    private static int[][] parseMapTiles(String value) {
        byte[] bytes = Base64.getDecoder().decode(value);
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN);
        int[][] mapTiles = new int[MAP_WIDTH][MAP_HEIGHT];
        for (int y = 0; y < MAP_HEIGHT; y++) {
            for (int x = 0; x < MAP_WIDTH; x++) {
                mapTiles[x][y] = buffer.getInt();
            }
        }
        return mapTiles;
    }

    private static double[] doubleArray(Map<String, String> input, String key, int size, double fallback) {
        double[] result = new double[size];
        String value = input.get(key);
        if (value == null || value.isEmpty()) {
            for (int i = 0; i < size; i++) {
                result[i] = fallback;
            }
            return result;
        }
        String[] parts = value.split(",");
        for (int i = 0; i < size; i++) {
            result[i] = i < parts.length && !parts[i].isEmpty() ? Double.parseDouble(parts[i]) : fallback;
        }
        return result;
    }

    private static boolean[] booleanArray(Map<String, String> input, String key, int size, boolean fallback) {
        boolean[] result = new boolean[size];
        String value = input.get(key);
        String[] parts = value == null ? new String[0] : value.split(",");
        for (int i = 0; i < size; i++) {
            result[i] = i < parts.length && !parts[i].isEmpty() ? "1".equals(parts[i]) || "true".equals(parts[i]) : fallback;
        }
        return result;
    }

    private static SynchronizedBool[] synchronizedBoolArray(Map<String, String> input, String key, int size) {
        boolean[] values = booleanArray(input, key, size, false);
        SynchronizedBool[] result = new SynchronizedBool[size];
        for (int i = 0; i < size; i++) {
            result[i] = new SynchronizedBool(values[i]);
        }
        return result;
    }

    private static int intValue(Map<String, String> input, String key, int fallback) {
        String value = input.get(key);
        return value == null || value.isEmpty() ? fallback : Integer.parseInt(value);
    }

    private static long longValue(Map<String, String> input, String key, long fallback) {
        String value = input.get(key);
        return value == null || value.isEmpty() ? fallback : Long.parseLong(value);
    }

    private static double doubleValue(Map<String, String> input, String key, double fallback) {
        String value = input.get(key);
        return value == null || value.isEmpty() ? fallback : Double.parseDouble(value);
    }

    private static boolean booleanValue(Map<String, String> input, String key, boolean fallback) {
        String value = input.get(key);
        return value == null || value.isEmpty() ? fallback : "1".equals(value) || "true".equals(value);
    }

    private static void applyStrokePower(
            int playerId,
            double[] playerX,
            double[] playerY,
            double[] speedX,
            double[] speedY,
            double mouseX,
            double mouseY,
            int shootingMode,
            Seed seed) {
        double deltaX = playerX[playerId] - mouseX;
        double deltaY = playerY[playerId] - mouseY;
        double distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        double magnitude = (distance - 5.0D) / 30.0D;
        if (magnitude < 0.075D) {
            magnitude = 0.075D;
        }
        if (magnitude > 6.5D) {
            magnitude = 6.5D;
        }

        if (distance == 0.0D) {
            speedX[playerId] = 0.0D;
            speedY[playerId] = 0.0D;
        } else {
            double scaleFactor = magnitude / distance;
            speedX[playerId] = (mouseX - playerX[playerId]) * scaleFactor;
            speedY[playerId] = (mouseY - playerY[playerId]) * scaleFactor;
        }

        if (shootingMode == 1) {
            speedX[playerId] = -speedX[playerId];
            speedY[playerId] = -speedY[playerId];
        }

        double temp;
        if (shootingMode == 2) {
            temp = speedX[playerId];
            speedX[playerId] = speedY[playerId];
            speedY[playerId] = -temp;
        }

        if (shootingMode == 3) {
            temp = speedX[playerId];
            speedX[playerId] = -speedY[playerId];
            speedY[playerId] = temp;
        }

        temp = Math.sqrt(speedX[playerId] * speedX[playerId] + speedY[playerId] * speedY[playerId]);
        double randomScale = temp / 6.5D;
        randomScale *= randomScale;
        speedX[playerId] += randomScale * ((double) (seed.next() % 50001) / 100000.0D - 0.25D);
        speedY[playerId] += randomScale * ((double) (seed.next() % 50001) / 100000.0D - 0.25D);
    }

    private static String toJson(HackedShot shot) {
        StringBuilder out = new StringBuilder(1024);
        out.append('{');
        appendFrames(out, shot.getFrames());
        out.append(',');
        appendDoubleArray(out, "playerX", shot.getPlayerX());
        out.append(',');
        appendDoubleArray(out, "playerY", shot.getPlayerY());
        out.append(',');
        appendDoubleArray(out, "speedX", shot.getSpeedX());
        out.append(',');
        appendDoubleArray(out, "speedY", shot.getSpeedY());
        out.append(',');
        appendBooleanArray(out, "onHole", shot.getResultOnHole());
        out.append(',');
        out.append("\"seedRaw\":").append(shot.getSeedRaw());
        out.append(',');
        appendMapTiles(out, shot.getMapTiles());
        out.append('}');
        return out.toString();
    }

    private static void appendFrames(StringBuilder out, List<double[]> frames) {
        out.append("\"frames\":[");
        for (int i = 0; i < frames.size(); i++) {
            if (i > 0) {
                out.append(',');
            }
            appendDoubleValues(out, frames.get(i));
        }
        out.append(']');
    }

    private static void appendDoubleArray(StringBuilder out, String name, double[] values) {
        out.append('"').append(name).append("\":");
        appendDoubleValues(out, values);
    }

    private static void appendDoubleValues(StringBuilder out, double[] values) {
        out.append('[');
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(Double.toString(values[i]));
        }
        out.append(']');
    }

    private static void appendBooleanArray(StringBuilder out, String name, boolean[] values) {
        out.append('"').append(name).append("\":[");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(values[i] ? "true" : "false");
        }
        out.append(']');
    }

    private static void appendMapTiles(StringBuilder out, int[][] mapTiles) {
        ByteBuffer buffer = ByteBuffer.allocate(MAP_WIDTH * MAP_HEIGHT * 4).order(ByteOrder.BIG_ENDIAN);
        for (int y = 0; y < MAP_HEIGHT; y++) {
            for (int x = 0; x < MAP_WIDTH; x++) {
                buffer.putInt(mapTiles[x][y]);
            }
        }
        out.append("\"mapTiles\":\"")
                .append(Base64.getEncoder().encodeToString(buffer.array()))
                .append('"');
    }
}
