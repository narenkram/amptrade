interface CustomWindow extends Window {
  Razorpay?: unknown
}

export const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if script is already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      // For Razorpay, we need to ensure the global object is available
      if (src.includes('razorpay') && !(window as CustomWindow).Razorpay) {
        reject(new Error('Razorpay failed to initialize'))
        return
      }
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = src

    script.onload = () => {
      // For Razorpay, ensure the global object is available before resolving
      if (src.includes('razorpay')) {
        // Add a small delay to ensure proper initialization
        setTimeout(() => {
          if ((window as CustomWindow).Razorpay) {
            resolve()
          } else {
            reject(new Error('Razorpay failed to initialize'))
          }
        }, 100)
      } else {
        resolve()
      }
    }

    script.onerror = (err) => reject(err)
    document.body.appendChild(script)
  })
}
