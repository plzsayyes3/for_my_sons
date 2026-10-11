// ひらがなの表記ゆれを認識する入力候補生成器（ヘボン式・訓令式など）。
// 複数の候補を保持するため、例えば shi と si は途中の s から分岐できる。
(function(global) {
  'use strict';
  function table(lines) {
    return Object.fromEntries(lines.join(' ').trim().split(/\s+/).map(token => {
      const [kana, value] = token.split(':');
      return [kana, value.split('/')];
    }));
  }
  const SINGLE = table([
    'あ:a い:i う:u え:e お:o',
    'か:ka き:ki く:ku け:ke こ:ko',
    'さ:sa し:shi/si す:su せ:se そ:so',
    'た:ta ち:chi/ti つ:tsu/tu て:te と:to',
    'な:na に:ni ぬ:nu ね:ne の:no',
    'は:ha ひ:hi ふ:fu/hu へ:he ほ:ho',
    'ま:ma み:mi む:mu め:me も:mo',
    'や:ya ゆ:yu よ:yo ら:ra り:ri る:ru れ:re ろ:ro',
    'わ:wa を:wo',
    'が:ga ぎ:gi ぐ:gu げ:ge ご:go',
    'ざ:za じ:ji/zi ず:zu ぜ:ze ぞ:zo',
    'だ:da ぢ:di/ji づ:du/zu で:de ど:do',
    'ば:ba び:bi ぶ:bu べ:be ぼ:bo',
    'ぱ:pa ぴ:pi ぷ:pu ぺ:pe ぽ:po',
    'ぁ:la/xa ぃ:li/xi ぅ:lu/xu ぇ:le/xe ぉ:lo/xo',
    'ゃ:lya/xya ゅ:lyu/xyu ょ:lyo/xyo',
    'ゔ:vu ー:-'
  ]);
  const DIGRAPH = table([
    'きゃ:kya きゅ:kyu きょ:kyo',
    'しゃ:sha/sya しゅ:shu/syu しょ:sho/syo',
    'ちゃ:cha/tya/cya ちゅ:chu/tyu/cyu ちょ:cho/tyo/cyo',
    'にゃ:nya にゅ:nyu にょ:nyo',
    'ひゃ:hya ひゅ:hyu ひょ:hyo',
    'みゃ:mya みゅ:myu みょ:myo',
    'りゃ:rya りゅ:ryu りょ:ryo',
    'ぎゃ:gya ぎゅ:gyu ぎょ:gyo',
    'じゃ:ja/zya/jya じゅ:ju/zyu/jyu じょ:jo/zyo/jyo',
    'ぢゃ:dya ぢゅ:dyu ぢょ:dyo',
    'びゃ:bya びゅ:byu びょ:byo',
    'ぴゃ:pya ぴゅ:pyu ぴょ:pyo'
  ]);
  function spellings(kana, preferred) {
    const memo = new Map(), max = 1024;
    function suffix(i) {
      if (i >= kana.length) return [''];
      if (memo.has(i)) return memo.get(i);
      const result = new Set();
      function add(prefixes, tails) {
        for (const prefix of prefixes) {
          for (const tail of tails) {
            if (result.size >= max) return;
            result.add(prefix + tail);
          }
        }
      }
      const letter = kana[i];
      if (letter === 'ん') {
        for (const tail of suffix(i + 1)) {
          // 母音・y・nの前では n だけだと次の音との区切りが曖昧。
          add(/^[aiueoyn]/.test(tail) ? ['nn', "n'"] : ['n', 'nn'], [tail]);
        }
      } else if (letter === 'っ') {
        for (const tail of suffix(i + 1)) {
          if (/^[bcdfghjklmpqrstvwxyz]/.test(tail)) add([tail[0]], [tail]);
          add(['ltu', 'xtu', 'ltsu', 'xtsu'], [tail]);
        }
      } else {
        const pair = DIGRAPH[kana.slice(i, i + 2)];
        if (pair) add(pair, suffix(i + 2));
        if (!SINGLE[letter]) throw new Error('未対応のかな: ' + letter);
        add(SINGLE[letter], suffix(i + 1));
      }
      const list = [...result];
      memo.set(i, list);
      return list;
    }
    const list = suffix(0);
    if (preferred && !list.includes(preferred)) list.unshift(preferred);
    return list;
  }
  global.GhostRomaji = { spellings };
})(window);
