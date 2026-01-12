// Lightweight shim to allow calling window.toast before the real implementation
(function(){
  if (typeof window === 'undefined') return;
  if (window.toast && typeof window.toast.show === 'function') return;

  window._toastQueue = window._toastQueue || [];

  function enqueue(method, args) {
    window._toastQueue.push({ method, args });
  }

  const noop = function(){ enqueue('noop', Array.from(arguments)); };

  const shim = {
    success: function(){ enqueue('success', Array.from(arguments)); },
    error: function(){ enqueue('error', Array.from(arguments)); },
    warning: function(){ enqueue('warning', Array.from(arguments)); },
    info: function(){ enqueue('info', Array.from(arguments)); },
    show: function(){ enqueue('show', Array.from(arguments)); },
    hide: function(){ enqueue('hide', Array.from(arguments)); }
  };

  // Expose shim immediately so early scripts won't throw
  window.toast = shim;
})();
