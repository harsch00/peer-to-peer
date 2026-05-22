const fs = require('fs');
const dir = 'node_modules/react-native/ReactCommon/react/bridging/';
['EventEmitter.h', 'Function.h', 'Base.h', 'CallbackWrapper.h'].forEach(f => {
  const p = dir + f;
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/#include <Function\.h>/g, '#include "Function.h"')
       .replace(/#include <Base\.h>/g, '#include "Base.h"')
       .replace(/#include <Convert\.h>/g, '#include "Convert.h"')
       .replace(/#include <CallbackWrapper\.h>/g, '#include "CallbackWrapper.h"')
       .replace(/#include <LongLivedObject\.h>/g, '#include "LongLivedObject.h"');
  fs.writeFileSync(p, c);
});
console.log('Done');
