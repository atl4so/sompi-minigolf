package com.aapeli.tools;

public class Tools {

    public static boolean sleep(long var0) {
        if (var0 <= 0L) {
            return true;
        } else {
            try {
                Thread.sleep(var0);
                return true;
            } catch (InterruptedException var3) {
                return false;
            }
        }
    }

    public static String changeToSaveable(String var0) {
        int var1 = var0.length();
        StringBuffer var2 = new StringBuffer(var1 * 2);

        for (int var4 = 0; var4 < var1; ++var4) {
            char var3 = var0.charAt(var4);
            if (var3 == '^') {
                var2.append("$p");
            } else if (var3 == '$') {
                var2.append("$d");
            } else {
                var2.append(var3);
            }
        }

        return var2.toString();
    }

    public static String changeFromSaveable(String s) {
        int length = s.length();
        StringBuffer sb = new StringBuffer(length);

        for (int i = 0; i < length; ++i) {
            char c = s.charAt(i);
            if (c == '$') {
                ++i;
                c = s.charAt(i);
                if (c == 'p') {
                    sb.append('^');
                } else {
                    if (c != 'd') {
                        System.out.println("Program error: Tools.changeFromSaveable(\""
                                + s
                                + "\"), "
                                + "unexpected character '"
                                + c
                                + "' after '$'");
                        return null;
                    }

                    sb.append('$');
                }
            } else {
                sb.append(c);
            }
        }

        return sb.toString();
    }

    public static boolean getBoolean(String var0) {
        if (var0 != null && var0.length() > 0) {
            var0 = var0.toLowerCase();
            char var1 = var0.charAt(0);
            if (var1 == 't' || var1 == 'y' || var0.equals("on") || var1 == '1') {
                return true;
            }
        }

        return false;
    }
}
