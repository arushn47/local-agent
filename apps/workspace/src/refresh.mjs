// Background ticks join existing work. Explicit actions must receive a fresh
// observation even when an idle read was already in flight.
export function createRefreshQueue(read){
 let flight;
 return function refresh({includeSession=true,force=true}={}){
  if(flight)return force?flight.then(()=>refresh({includeSession,force})):flight;
  flight=Promise.resolve().then(()=>read({includeSession})).finally(()=>{flight=undefined;});
  return flight;
 };
}
